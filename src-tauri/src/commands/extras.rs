use tauri::State;

use crate::error::{AppError, AppResult};
use crate::extras::{self, achievements::AchievementsReport, news::NewsItem, screenshots::Screenshot};
use crate::state::AppState;

#[tauri::command]
pub fn game_screenshots(state: State<'_, AppState>, game_id: String) -> AppResult<Vec<Screenshot>> {
    let game = state.db.get_game(&game_id)?;
    Ok(extras::screenshots::find(&game, extras::steam_appid(&game).as_deref()))
}

#[tauri::command]
pub async fn game_news(state: State<'_, AppState>, game_id: String) -> AppResult<Vec<NewsItem>> {
    let game = state.db.get_game(&game_id)?;
    let Some(appid) = extras::steam_appid(&game) else { return Ok(vec![]) };
    extras::news::fetch(&state.http, &appid).await
}

#[tauri::command]
pub async fn game_achievements(state: State<'_, AppState>, game_id: String) -> AppResult<AchievementsReport> {
    let game = state.db.get_game(&game_id)?;
    let appid = extras::steam_appid(&game).ok_or_else(|| AppError::msg("Este juego no está en Steam"))?;
    let key = state
        .db
        .get_setting("steamWebApiKey")?
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| AppError::msg("Configura tu clave de la Web API de Steam en Ajustes"))?;
    let steam_id = state
        .db
        .get_setting("steamId")?
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.trim().is_empty())
        .or_else(extras::steam_user_id)
        .ok_or_else(|| AppError::msg("No se pudo detectar tu SteamID; escríbelo en Ajustes"))?;
    extras::achievements::fetch(&state.http, key.trim(), steam_id.trim(), &appid).await
}

/// SteamID64 detectado del cliente de Steam (para mostrarlo en Ajustes).
#[tauri::command]
pub fn detected_steam_id() -> Option<String> {
    extras::steam_user_id()
}
