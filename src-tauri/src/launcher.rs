//! Lanza un juego a partir de su `LaunchTarget` aplicando las opciones de lanzamiento del usuario.

use std::os::windows::process::CommandExt;
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::models::{LaunchOptions, LaunchTarget, Store};

const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Divide una línea de argumentos respetando comillas dobles.
pub fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for c in s.chars() {
        match c {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// Ejecuta un comando de consola del usuario (antes/después de jugar) sin ventana y sin esperar.
pub fn run_user_command(cmd: &str, cwd: Option<&str>) {
    let cmd = cmd.trim();
    if cmd.is_empty() {
        return;
    }
    let mut c = Command::new("cmd.exe");
    c.args(["/C", cmd]).creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS);
    if let Some(dir) = cwd.filter(|d| std::path::Path::new(d).is_dir()) {
        c.current_dir(dir);
    }
    if let Err(e) = c.spawn() {
        eprintln!("[launch] comando de usuario falló: {e}");
    }
}

/// Devuelve el PID del proceso hijo cuando se lanza un ejecutable directamente
/// (con URIs o como administrador el proceso lo crea otro y no lo conocemos).
pub fn launch(target: &LaunchTarget, opts: &LaunchOptions) -> AppResult<Option<u32>> {
    let extra = split_args(&opts.args);
    match target {
        LaunchTarget::Uri { uri } => {
            // Steam admite argumentos con steam://run/<id>//<args>/ ; el resto de tiendas no.
            let uri = match uri.strip_prefix("steam://rungameid/") {
                Some(id) if !extra.is_empty() => format!("steam://run/{id}//{}/", opts.args.trim()),
                _ => uri.clone(),
            };
            Command::new("explorer.exe")
                .arg(&uri)
                .spawn()
                .map_err(|e| AppError::msg(format!("No se pudo abrir {uri}: {e}")))?;
            Ok(None)
        }
        LaunchTarget::Exe { path, args, cwd } => {
            let cwd = cwd.as_deref().filter(|d| std::path::Path::new(d).is_dir());
            let all_args: Vec<String> = args.iter().cloned().chain(extra).collect();

            if opts.run_as_admin {
                // Start-Process -Verb RunAs muestra el UAC; no devuelve el PID del proceso elevado.
                let ps_args = all_args
                    .iter()
                    .map(|a| format!("'{}'", a.replace('\'', "''")))
                    .collect::<Vec<_>>()
                    .join(",");
                let mut script = format!("Start-Process -FilePath '{}' -Verb RunAs", path.replace('\'', "''"));
                if !all_args.is_empty() {
                    script.push_str(&format!(" -ArgumentList @({ps_args})"));
                }
                if let Some(dir) = cwd {
                    script.push_str(&format!(" -WorkingDirectory '{}'", dir.replace('\'', "''")));
                }
                Command::new("powershell.exe")
                    .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn()
                    .map_err(|e| AppError::msg(format!("No se pudo elevar {path}: {e}")))?;
                return Ok(None);
            }

            let mut cmd = Command::new(path);
            cmd.args(&all_args).creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
            if let Some(dir) = cwd {
                cmd.current_dir(dir);
            }
            let child = cmd
                .spawn()
                .map_err(|e| AppError::msg(format!("No se pudo ejecutar {path}: {e}")))?;
            Ok(Some(child.id()))
        }
    }
}

/// Cierra el cliente de la tienda (opción "cerrar la tienda al salir del juego").
pub fn shutdown_store(store: Store) {
    let kill = |names: &[&str]| {
        for n in names {
            let _ = Command::new("taskkill.exe")
                .args(["/F", "/IM", n])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }
    };
    match store {
        Store::Steam => {
            // Apagado limpio: steam.exe -shutdown (guarda sincronización en la nube).
            if let Some(root) = crate::scanners::steam_root() {
                let _ = Command::new(root.join("steam.exe")).arg("-shutdown").creation_flags(CREATE_NO_WINDOW).spawn();
            }
        }
        Store::Epic => kill(&["EpicGamesLauncher.exe", "EpicWebHelper.exe"]),
        Store::Gog => kill(&["GalaxyClient.exe", "GalaxyClientService.exe"]),
        Store::Ea => kill(&["EADesktop.exe", "EABackgroundService.exe", "Origin.exe"]),
        Store::Ubisoft => kill(&["upc.exe", "UbisoftConnect.exe", "UplayWebCore.exe"]),
        Store::Battlenet => kill(&["Battle.net.exe"]),
        Store::Xbox | Store::Manual => {}
    }
}

pub fn open_folder(path: &str) -> AppResult<()> {
    Command::new("explorer.exe").arg(path).spawn()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_quoted_args() {
        assert_eq!(split_args(r#"-windowed "-dir=C:\Mis Juegos" -w 1920"#), vec!["-windowed", r"-dir=C:\Mis Juegos", "-w", "1920"]);
        assert!(split_args("   ").is_empty());
    }
}
