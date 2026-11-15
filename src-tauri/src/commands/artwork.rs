use tauri::{AppHandle, State};

use crate::artwork::{self, steamgriddb::Sgdb};
use crate::error::{AppError, AppResult};
use crate::models::{ArtKind, ArtOption, Game, SgdbGame};
use crate::state::AppState;

fn sgdb_key(state: &AppState) -> AppResult<String> {
    state
        .db
        .sgdb_api_key()
        .ok_or_else(|| AppError::msg("Configura tu API key de SteamGridDB en Ajustes"))
}

/// Alternativas de arte en SteamGridDB para un juego.
#[tauri::command]
pub async fn art_options(state: State<'_, AppState>, game_id: String, kind: ArtKind) -> AppResult<Vec<ArtOption>> {
    let key = sgdb_key(&state)?;
    let game = state.db.get_game(&game_id)?;
    let sgdb = Sgdb { http: &state.http, key: &key };

    let sgdb_id = match game.sgdb_id {
        Some(id) => id,
        None => {
            let title = game.custom_title.as_deref().unwrap_or(&game.title);
            let found = sgdb
                .search(title)
                .await?
                .into_iter()
                .next()
                .ok_or_else(|| AppError::msg("No se encontró el juego en SteamGridDB"))?;
            state.db.set_sgdb_id(&game_id, Some(found.id))?;
            found.id
        }
    };
    sgdb.assets(sgdb_id, kind).await
}

#[tauri::command]
pub async fn set_art_from_url(state: State<'_, AppState>, game_id: String, kind: ArtKind, url: String) -> AppResult<Game> {
    artwork::download(&state, &game_id, kind, &url).await?;
    state.db.get_game(&game_id)
}

#[tauri::command]
pub fn set_art_from_file(state: State<'_, AppState>, game_id: String, kind: ArtKind, path: String) -> AppResult<Game> {
    artwork::import_file(&state, &game_id, kind, &path)?;
    state.db.get_game(&game_id)
}

#[tauri::command]
pub fn clear_art(state: State<'_, AppState>, game_id: String, kind: ArtKind) -> AppResult<Game> {
    state.db.set_art(&game_id, kind, None)?;
    state.db.get_game(&game_id)
}

#[tauri::command]
pub async fn sgdb_search(state: State<'_, AppState>, term: String) -> AppResult<Vec<SgdbGame>> {
    let key = sgdb_key(&state)?;
    Sgdb { http: &state.http, key: &key }.search(&term).await
}

/// Corrige la coincidencia en SteamGridDB y vuelve a descargar todo el arte del juego.
#[tauri::command]
pub fn set_sgdb_game(app: AppHandle, state: State<'_, AppState>, game_id: String, sgdb_id: i64) -> AppResult<Game> {
    state.db.set_sgdb_id(&game_id, Some(sgdb_id))?;
    for kind in ArtKind::ALL {
        state.db.set_art(&game_id, kind, None)?;
    }
    state.db.mark_art_fetched(&game_id, false)?;
    artwork::spawn_fetch_missing(app);
    state.db.get_game(&game_id)
}

/// Reintenta descargar el arte que falte en toda la biblioteca.
#[tauri::command]
pub fn refetch_missing_art(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.db.reset_art_fetched_for_missing()?;
    artwork::spawn_fetch_missing(app);
    Ok(())
}
