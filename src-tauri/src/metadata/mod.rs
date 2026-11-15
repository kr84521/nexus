//! Metadatos (descripción, géneros, año, desarrollador) y tráiler desde la Store de Steam.
//! No necesita API key. Para juegos que no son de Steam se busca el título en la tienda y solo se
//! acepta si el nombre coincide, para no asignar datos de otro juego.

pub mod steam_store;

use std::sync::atomic::Ordering;

use futures::stream::{self, StreamExt};
use tauri::{AppHandle, Emitter, Manager};

use crate::artwork::EVENT_ART_UPDATED;
use crate::error::AppResult;
use crate::library::normalize_title;
use crate::state::AppState;

/// Descarga en segundo plano los metadatos que falten. Reutiliza el evento de arte para refrescar la UI.
pub fn spawn_fetch_missing(app: AppHandle) {
    let state = app.state::<AppState>();
    if state.fetching_meta.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let jobs = state.db.metadata_jobs().unwrap_or_default();
        stream::iter(jobs)
            .for_each_concurrent(2, |(game_id, title, steam_appid)| {
                let app = app.clone();
                async move {
                    let state = app.state::<AppState>();
                    match fetch_one(&state, &title, steam_appid.as_deref()).await {
                        Ok(Some(meta)) => {
                            let _ = state.db.set_metadata(&game_id, &meta);
                        }
                        Ok(None) => {}
                        Err(e) => eprintln!("[meta] {game_id}: {e}"),
                    }
                    let _ = state.db.mark_meta_fetched(&game_id, true);
                    let _ = app.emit(EVENT_ART_UPDATED, &game_id);
                }
            })
            .await;
        state.fetching_meta.store(false, Ordering::SeqCst);
    });
}

async fn fetch_one(state: &AppState, title: &str, steam_appid: Option<&str>) -> AppResult<Option<crate::models::Metadata>> {
    let client = steam_store::SteamStore { http: &state.http };
    let appid = match steam_appid {
        Some(id) => Some(id.to_string()),
        None => {
            let wanted = normalize_title(title);
            client
                .search(title)
                .await?
                .into_iter()
                .find(|r| normalize_title(&r.name) == wanted)
                .map(|r| r.id.to_string())
        }
    };
    let Some(appid) = appid else { return Ok(None) };
    client.details(&appid).await
}
