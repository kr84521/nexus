//! Lanza un juego a partir de su `LaunchTarget`.

use std::os::windows::process::CommandExt;
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::models::LaunchTarget;

const DETACHED_PROCESS: u32 = 0x0000_0008;
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;

/// Devuelve el PID del proceso hijo cuando se lanza un ejecutable directamente
/// (con URIs el proceso lo crea la tienda y no lo conocemos).
pub fn launch(target: &LaunchTarget) -> AppResult<Option<u32>> {
    match target {
        // explorer.exe resuelve cualquier protocolo registrado y también shell:AppsFolder\...
        LaunchTarget::Uri { uri } => {
            Command::new("explorer.exe")
                .arg(uri)
                .spawn()
                .map_err(|e| AppError::msg(format!("No se pudo abrir {uri}: {e}")))?;
            Ok(None)
        }
        LaunchTarget::Exe { path, args, cwd } => {
            let mut cmd = Command::new(path);
            cmd.args(args).creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
            if let Some(dir) = cwd.as_deref().filter(|d| std::path::Path::new(d).is_dir()) {
                cmd.current_dir(dir);
            }
            let child = cmd
                .spawn()
                .map_err(|e| AppError::msg(format!("No se pudo ejecutar {path}: {e}")))?;
            Ok(Some(child.id()))
        }
    }
}

pub fn open_folder(path: &str) -> AppResult<()> {
    Command::new("explorer.exe").arg(path).spawn()?;
    Ok(())
}
