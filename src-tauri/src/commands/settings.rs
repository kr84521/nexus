use tauri::{AppHandle, State};

use crate::artwork;
use crate::error::AppResult;
use crate::state::AppState;

/// Ajustes como mapa JSON libre (`theme`, `sgdbApiKey`, `layout`...). El frontend define su forma.
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<serde_json::Map<String, serde_json::Value>> {
    state.db.all_settings()
}

#[tauri::command]
pub fn set_setting(app: AppHandle, state: State<'_, AppState>, key: String, value: serde_json::Value) -> AppResult<()> {
    state.db.set_setting(&key, &value)?;
    if key == "sgdbApiKey" {
        state.db.reset_art_fetched_for_missing()?;
        artwork::spawn_fetch_missing(app);
    }
    Ok(())
}

/// Notificación nativa solo si la ventana no está a la vista (p. ej. aviso de actualización desde la bandeja).
#[tauri::command]
pub fn notify_when_hidden(app: AppHandle, title: String, body: String) {
    crate::notify::when_hidden(&app, &title, &body);
}
