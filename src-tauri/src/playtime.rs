//! Seguimiento del tiempo de juego. Tras lanzar un juego se vigila en un hilo si hay algún proceso
//! cuyo ejecutable esté dentro de la carpeta de instalación (o el proceso hijo directo). Cuando
//! desaparece se registra la sesión y se emiten eventos para la UI.

use std::collections::HashSet;
use std::path::Path;
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Emitter, Manager};

use crate::launcher;
use crate::models::Store;
use crate::state::AppState;

pub const EVENT_GAME_RUNNING: &str = "game-running";
pub const EVENT_SESSION_ENDED: &str = "session-ended";

/// Qué hacer cuando termina la sesión (opciones de lanzamiento del juego).
#[derive(Default)]
pub struct ExitActions {
    pub post_command: String,
    pub close_store: Option<Store>,
    pub cwd: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SessionEndedPayload<'a> {
    game_id: &'a str,
    secs: i64,
}

/// Tiempo máximo esperando a que aparezca el proceso (las tiendas tardan en arrancar).
const WAIT_FOR_START: Duration = Duration::from_secs(150);
const POLL_STARTING: Duration = Duration::from_secs(2);
const POLL_RUNNING: Duration = Duration::from_secs(5);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RunningPayload<'a> {
    game_id: &'a str,
    running: bool,
}

fn norm(p: &Path) -> String {
    p.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}

/// Carpetas demasiado genéricas como para identificar un juego por ellas.
fn is_usable_root(install: &str) -> bool {
    let n = install.trim_end_matches('\\');
    n.len() > 3 && !n.to_lowercase().ends_with("program files") && !n.to_lowercase().ends_with("program files (x86)")
}

pub fn track(app: AppHandle, game_id: String, install_path: Option<String>, child_pid: Option<u32>, on_exit: ExitActions) {
    let root = install_path.map(|p| norm(Path::new(&p))).filter(|r| is_usable_root(r));
    if root.is_none() && child_pid.is_none() {
        return;
    }
    std::thread::spawn(move || watch(app, game_id, root, child_pid, on_exit));
}

fn matching_pids(sys: &mut System, root: Option<&str>, child: Option<u32>) -> HashSet<Pid> {
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    let mut set = HashSet::new();
    for (pid, proc_) in sys.processes() {
        if child.is_some_and(|c| c == pid.as_u32()) {
            set.insert(*pid);
            continue;
        }
        if let (Some(root), Some(exe)) = (root, proc_.exe()) {
            let exe = norm(exe);
            if exe.starts_with(root) && exe.as_bytes().get(root.len()) == Some(&b'\\') {
                set.insert(*pid);
            }
        }
    }
    set
}

fn watch(app: AppHandle, game_id: String, root: Option<String>, child: Option<u32>, on_exit: ExitActions) {
    let mut sys = System::new();
    let deadline = Instant::now() + WAIT_FOR_START;

    // Fase 1: esperar a que arranque.
    let started = loop {
        if !matching_pids(&mut sys, root.as_deref(), child).is_empty() {
            break Instant::now();
        }
        if Instant::now() > deadline {
            return;
        }
        std::thread::sleep(POLL_STARTING);
    };
    let _ = app.emit(EVENT_GAME_RUNNING, RunningPayload { game_id: &game_id, running: true });
    if let Ok(g) = app.state::<AppState>().db.get_game(&game_id) {
        crate::discord::set_playing(&app, &g, crate::library::now_ms() / 1000);
    }

    // Fase 2: vigilar hasta que no quede ningún proceso (dos comprobaciones seguidas, por si el juego se relanza).
    let mut misses = 0;
    loop {
        std::thread::sleep(POLL_RUNNING);
        if matching_pids(&mut sys, root.as_deref(), child).is_empty() {
            misses += 1;
            if misses >= 2 {
                break;
            }
        } else {
            misses = 0;
        }
    }

    crate::discord::clear(&app);
    let secs = started.elapsed().as_secs().saturating_sub(POLL_RUNNING.as_secs() * 2) as i64;
    let state = app.state::<AppState>();
    if let Err(e) = state.db.add_session(&game_id, started_ms(started), secs) {
        eprintln!("[playtime] {game_id}: {e}");
    }
    let _ = app.emit(EVENT_GAME_RUNNING, RunningPayload { game_id: &game_id, running: false });
    let _ = app.emit(crate::artwork::EVENT_ART_UPDATED, &game_id); // reutiliza el refresco de un juego
    let _ = app.emit(EVENT_SESSION_ENDED, SessionEndedPayload { game_id: &game_id, secs });
    if let Ok(g) = state.db.get_game(&game_id) {
        let title = g.custom_title.clone().unwrap_or(g.title.clone());
        crate::notify::when_hidden(&app, &title, &format!("Has jugado {}", crate::notify::fmt_secs(secs)));
    }

    launcher::run_user_command(&on_exit.post_command, on_exit.cwd.as_deref());
    if let Some(store) = on_exit.close_store {
        launcher::shutdown_store(store);
    }

    let auto_backup = state
        .db
        .get_setting("autoBackupSaves")
        .ok()
        .flatten()
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if auto_backup {
        match state.db.get_game(&game_id).and_then(|g| crate::saves::backup(&state, &g)) {
            Ok(b) => {
                let _ = app.emit("saves-backed-up", serde_json::json!({ "gameId": game_id, "files": b.files }));
                crate::notify::when_hidden(&app, "Copia de partidas guardada", &format!("{} archivos", b.files));
            }
            Err(e) => eprintln!("[saves] {game_id}: {e}"),
        }
    }
}

fn started_ms(at: Instant) -> i64 {
    crate::library::now_ms() - at.elapsed().as_millis() as i64
}
