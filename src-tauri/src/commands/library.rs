use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::artwork;
use crate::error::{AppError, AppResult};
use crate::launcher;
use crate::library;
use crate::models::{Collection, Game, ScanReport};
use crate::playtime;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    games: Vec<Game>,
    collections: Vec<Collection>,
}

#[tauri::command]
pub fn get_library(state: State<'_, AppState>) -> AppResult<LibrarySnapshot> {
    Ok(LibrarySnapshot { games: state.db.load_games()?, collections: state.db.list_collections()? })
}

#[tauri::command]
pub async fn scan_library(app: AppHandle) -> AppResult<ScanReport> {
    let handle = app.clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        library::scan_all(&handle.state::<AppState>().db)
    })
    .await
    .map_err(|e| AppError::msg(e.to_string()))??;
    artwork::spawn_fetch_missing(app);
    Ok(report)
}

#[tauri::command]
pub fn launch_game(app: AppHandle, state: State<'_, AppState>, id: String, source_id: Option<String>) -> AppResult<Game> {
    let game = state.db.get_game(&id)?;
    let wanted = source_id.or(game.preferred_source.clone());
    let source = wanted
        .and_then(|sid| game.sources.iter().find(|s| s.id == sid))
        .or_else(|| game.sources.first())
        .ok_or_else(|| AppError::msg("Este juego no tiene ninguna instalación"))?;
    let child = launcher::launch(&source.launch)?;
    state.db.record_launch(&id)?;
    playtime::track(app, id.clone(), source.install_path.clone(), child);
    state.db.get_game(&id)
}

#[tauri::command]
pub fn set_favorite(state: State<'_, AppState>, id: String, value: bool) -> AppResult<Game> {
    state.db.set_favorite(&id, value)?;
    state.db.get_game(&id)
}

#[tauri::command]
pub fn set_hidden(state: State<'_, AppState>, id: String, value: bool) -> AppResult<Game> {
    state.db.set_hidden(&id, value)?;
    state.db.get_game(&id)
}

#[tauri::command]
pub fn set_custom_title(state: State<'_, AppState>, id: String, title: Option<String>) -> AppResult<Game> {
    state.db.set_custom_title(&id, title.as_deref())?;
    state.db.get_game(&id)
}

#[tauri::command]
pub fn set_preferred_source(state: State<'_, AppState>, id: String, source_id: Option<String>) -> AppResult<Game> {
    state.db.set_preferred_source(&id, source_id.as_deref())?;
    state.db.get_game(&id)
}

#[tauri::command]
pub fn open_install_folder(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let game = state.db.get_game(&id)?;
    let path = game
        .sources
        .iter()
        .find_map(|s| s.install_path.clone().filter(|p| std::path::Path::new(p).exists()))
        .ok_or_else(|| AppError::msg("No se conoce la carpeta de instalación"))?;
    launcher::open_folder(&path)
}

#[tauri::command]
pub fn add_manual_game(app: AppHandle, state: State<'_, AppState>, title: String, exe: String) -> AppResult<Game> {
    if !std::path::Path::new(&exe).is_file() {
        return Err(AppError::msg("El ejecutable no existe"));
    }
    let id = state.db.add_manual_game(title.trim(), &exe)?;
    artwork::spawn_fetch_missing(app);
    state.db.get_game(&id)
}

#[tauri::command]
pub fn remove_game(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.remove_game(&id)?;
    artwork::remove_game_art(&state, &id);
    Ok(())
}

#[tauri::command]
pub fn merge_games(state: State<'_, AppState>, into: String, from: String) -> AppResult<Game> {
    state.db.merge_games(&into, &from)?;
    artwork::remove_game_art(&state, &from);
    state.db.get_game(&into)
}

#[tauri::command]
pub fn split_source(app: AppHandle, state: State<'_, AppState>, source_id: String) -> AppResult<Game> {
    let new_id = state.db.split_source(&source_id)?;
    artwork::spawn_fetch_missing(app);
    state.db.get_game(&new_id)
}

// ------------------------------------------------------------------ colecciones

#[tauri::command]
pub fn create_collection(state: State<'_, AppState>, name: String) -> AppResult<Collection> {
    if name.trim().is_empty() {
        return Err(AppError::msg("El nombre no puede estar vacío"));
    }
    state.db.create_collection(&name)
}

#[tauri::command]
pub fn rename_collection(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    state.db.rename_collection(&id, &name)
}

#[tauri::command]
pub fn delete_collection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_collection(&id)
}

#[tauri::command]
pub fn set_in_collection(
    state: State<'_, AppState>,
    collection_id: String,
    game_id: String,
    member: bool,
) -> AppResult<Game> {
    state.db.set_in_collection(&collection_id, &game_id, member)?;
    state.db.get_game(&game_id)
}
