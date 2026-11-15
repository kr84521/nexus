//! Copias de partidas guardadas. Son operaciones de disco/red: se ejecutan fuera del hilo principal.

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::saves::{self, SaveBackup, SaveInfo};
use crate::state::AppState;

async fn blocking<T: Send + 'static>(
    app: AppHandle,
    f: impl FnOnce(&AppState) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(move || f(&app.state::<AppState>()))
        .await
        .map_err(|e| AppError::msg(e.to_string()))?
}

#[tauri::command]
pub async fn saves_info(app: AppHandle, game_id: String) -> AppResult<SaveInfo> {
    blocking(app, move |s| saves::info(s, &s.db.get_game(&game_id)?)).await
}

#[tauri::command]
pub async fn backup_saves(app: AppHandle, game_id: String) -> AppResult<SaveBackup> {
    blocking(app, move |s| saves::backup(s, &s.db.get_game(&game_id)?)).await
}

#[tauri::command]
pub async fn restore_saves(app: AppHandle, game_id: String, name: String) -> AppResult<usize> {
    blocking(app, move |s| saves::restore(s, &game_id, &name)).await
}

#[tauri::command]
pub fn open_path(path: String) -> AppResult<()> {
    crate::launcher::open_folder(&path)
}
