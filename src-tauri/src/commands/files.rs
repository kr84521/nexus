//! Comandos de archivos: fondo personalizado, temas en JSON y copias de la biblioteca.

use std::fs;
use std::path::Path;

use tauri::State;

use crate::backup::{self, ImportReport};
use crate::error::{AppError, AppResult};
use crate::library::now_ms;
use crate::state::AppState;

/// Copia una imagen elegida por el usuario a AppData y devuelve su ruta (para el ajuste `backgroundImage`).
#[tauri::command]
pub fn set_background_image(state: State<'_, AppState>, path: String) -> AppResult<String> {
    let src = Path::new(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .filter(|e| ["png", "jpg", "jpeg", "webp", "gif"].contains(&e.as_str()))
        .ok_or_else(|| AppError::msg("Formato no soportado (usa png, jpg, webp o gif)"))?;
    let dir = state.art_dir.parent().unwrap_or(&state.art_dir).join("backgrounds");
    fs::create_dir_all(&dir)?;
    for old in fs::read_dir(&dir)?.flatten() {
        let _ = fs::remove_file(old.path());
    }
    let dest = dir.join(format!("bg-{}.{ext}", now_ms()));
    fs::copy(src, &dest)?;
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> AppResult<()> {
    fs::write(&path, content)?;
    Ok(())
}

#[tauri::command]
pub fn read_text_file(path: String) -> AppResult<String> {
    Ok(fs::read_to_string(&path)?)
}

#[tauri::command]
pub fn export_library(state: State<'_, AppState>, dir: String) -> AppResult<usize> {
    backup::export(&state, &dir)
}

#[tauri::command]
pub fn import_library(state: State<'_, AppState>, dir: String) -> AppResult<ImportReport> {
    backup::import(&state, &dir)
}
