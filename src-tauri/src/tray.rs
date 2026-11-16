//! Icono en la bandeja del sistema: abrir, escanear, salir. La ventana se esconde aquí al cerrarla
//! (si el ajuste `closeToTray` está activo, por defecto sí).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;

pub const EVENT_SCAN_REQUESTED: &str = "scan-requested";
const TRAY_ID: &str = "main";
const RECENT_COUNT: usize = 5;

/// Construye el menú: acciones fijas + los últimos juegos jugados ("play:<id>").
fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Abrir Nexus", true, None::<&str>)?;
    let scan = MenuItem::with_id(app, "scan", "Escanear biblioteca", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &scan])?;

    let mut recent = app.state::<AppState>().db.load_games().unwrap_or_default();
    recent.retain(|g| g.last_played.is_some() && !g.hidden);
    recent.sort_by(|a, b| b.last_played.cmp(&a.last_played));
    if !recent.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        for g in recent.iter().take(RECENT_COUNT) {
            let title = g.custom_title.clone().unwrap_or_else(|| g.title.clone());
            let item = MenuItem::with_id(app, format!("play:{}", g.id), format!("Jugar a {title}"), true, None::<&str>)?;
            menu.append(&item)?;
        }
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&quit)?;
    Ok(menu)
}

/// Vuelve a generar el menú de la bandeja (tras jugar o escanear).
pub fn refresh_recent(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY_ID), build_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn close_to_tray(app: &AppHandle) -> bool {
    app.state::<AppState>()
        .db
        .get_setting("closeToTray")
        .ok()
        .flatten()
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("icono de la ventana".into()))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Nexus")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "scan" => {
                show_main(app);
                let _ = app.emit(EVENT_SCAN_REQUESTED, ());
            }
            "quit" => app.exit(0),
            id => {
                if let Some(game_id) = id.strip_prefix("play:") {
                    let state = app.state::<AppState>();
                    if let Err(e) = crate::commands::library::launch_by_id(app, &state, game_id, None) {
                        eprintln!("[tray] {e}");
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
