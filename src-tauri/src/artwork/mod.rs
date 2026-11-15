//! Arte de los juegos: descarga automática en segundo plano, alternativas y caché en disco.
//! Las imágenes se guardan en `<AppData>/artwork/<juego>/<tipo>-<timestamp>.<ext>` y el frontend
//! las muestra con el protocolo `asset:` (convertFileSrc).

pub mod steamgriddb;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;

use futures::stream::{self, StreamExt};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::ArtJob;
use crate::error::{AppError, AppResult};
use crate::library::now_ms;
use crate::models::ArtKind;
use crate::state::AppState;
use steamgriddb::{steam_cdn_url, Sgdb};

pub const EVENT_ART_UPDATED: &str = "artwork-updated";
pub const EVENT_ART_DONE: &str = "artwork-done";

fn game_dir(base: &Path, game_id: &str) -> PathBuf {
    let safe: String = game_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    base.join(safe)
}

/// Borra versiones anteriores de un tipo de arte antes de guardar la nueva.
fn clear_kind(dir: &Path, kind: ArtKind) {
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().starts_with(&format!("{}-", kind.name())) {
                let _ = fs::remove_file(e.path());
            }
        }
    }
}

fn ext_from(content_type: Option<&str>, url: &str) -> &'static str {
    match content_type.unwrap_or("") {
        t if t.contains("png") => "png",
        t if t.contains("webp") => "webp",
        t if t.contains("gif") => "gif",
        t if t.contains("jpeg") || t.contains("jpg") => "jpg",
        t if t.contains("icon") => "ico",
        _ => {
            let lower = url.to_lowercase();
            ["png", "webp", "gif", "ico", "jpg"]
                .into_iter()
                .find(|e| lower.ends_with(&format!(".{e}")))
                .unwrap_or("jpg")
        }
    }
}

/// Descarga una imagen y la guarda como arte del juego. Devuelve la ruta local.
pub async fn download(state: &AppState, game_id: &str, kind: ArtKind, url: &str) -> AppResult<String> {
    let res = state.http.get(url).send().await?;
    if !res.status().is_success() {
        return Err(AppError::msg(format!("Descarga fallida ({})", res.status())));
    }
    let ct = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    if ct.as_deref().is_some_and(|t| !t.starts_with("image/")) {
        return Err(AppError::msg("La URL no devuelve una imagen"));
    }
    let bytes = res.bytes().await?;
    store_bytes(state, game_id, kind, &bytes, ext_from(ct.as_deref(), url))
}

/// Copia una imagen local elegida por el usuario.
pub fn import_file(state: &AppState, game_id: &str, kind: ArtKind, src: &str) -> AppResult<String> {
    let bytes = fs::read(src)?;
    let ext = Path::new(src)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| "png".into());
    let ext: &str = match ext.as_str() {
        "png" => "png",
        "webp" => "webp",
        "gif" => "gif",
        "ico" => "ico",
        "jpg" | "jpeg" => "jpg",
        _ => return Err(AppError::msg("Formato no soportado (usa png, jpg, webp, gif o ico)")),
    };
    store_bytes(state, game_id, kind, &bytes, ext)
}

fn store_bytes(state: &AppState, game_id: &str, kind: ArtKind, bytes: &[u8], ext: &str) -> AppResult<String> {
    let dir = game_dir(&state.art_dir, game_id);
    fs::create_dir_all(&dir)?;
    clear_kind(&dir, kind);
    let path = dir.join(format!("{}-{}.{}", kind.name(), now_ms(), ext));
    fs::write(&path, bytes)?;
    let path = path.to_string_lossy().into_owned();
    state.db.set_art(game_id, kind, Some(&path))?;
    Ok(path)
}

pub fn remove_game_art(state: &AppState, game_id: &str) {
    let _ = fs::remove_dir_all(game_dir(&state.art_dir, game_id));
}

/// Lanza en segundo plano la descarga del arte que falte. Si ya hay una en curso, no hace nada.
pub fn spawn_fetch_missing(app: AppHandle) {
    let state = app.state::<AppState>();
    if state.fetching.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let jobs = state.db.art_jobs().unwrap_or_default();
        let key = state.db.sgdb_api_key();

        stream::iter(jobs)
            .for_each_concurrent(4, |job| {
                let app = app.clone();
                let key = key.clone();
                async move {
                    let state = app.state::<AppState>();
                    let id = job.game_id.clone();
                    if let Err(e) = fetch_job(&state, key.as_deref(), job).await {
                        eprintln!("[arte] {id}: {e}");
                    }
                    let _ = app.emit(EVENT_ART_UPDATED, &id);
                }
            })
            .await;

        state.fetching.store(false, Ordering::SeqCst);
        let _ = app.emit(EVENT_ART_DONE, ());
    });
}

async fn fetch_job(state: &AppState, key: Option<&str>, job: ArtJob) -> AppResult<()> {
    let mut missing = job.missing.clone();

    if let Some(key) = key {
        match fetch_from_sgdb(state, key, &job).await {
            Ok(left) => missing = left,
            Err(e) => eprintln!("[arte] SteamGridDB {}: {e}", job.game_id),
        }
    }

    // Fallback: CDN de Steam.
    if let Some(appid) = &job.steam_appid {
        for kind in missing {
            let _ = download(state, &job.game_id, kind, &steam_cdn_url(appid, kind)).await;
        }
    }

    state.db.mark_art_fetched(&job.game_id, true)?;
    Ok(())
}

/// Descarga desde SteamGridDB el primer resultado de cada tipo pendiente. Devuelve los que siguen faltando.
async fn fetch_from_sgdb(state: &AppState, key: &str, job: &ArtJob) -> AppResult<Vec<ArtKind>> {
    let sgdb = Sgdb { http: &state.http, key };
    let sgdb_id = match job.sgdb_id {
        Some(id) => Some(id),
        None => {
            let mut found = match &job.steam_appid {
                Some(appid) => sgdb.by_steam_appid(appid).await.ok().flatten(),
                None => None,
            };
            if found.is_none() {
                found = sgdb.search(&job.title).await?.into_iter().next();
            }
            if let Some(g) = &found {
                state.db.set_sgdb_id(&job.game_id, Some(g.id))?;
            }
            found.map(|g| g.id)
        }
    };
    let Some(sgdb_id) = sgdb_id else { return Ok(job.missing.clone()) };

    let mut left = Vec::new();
    for &kind in &job.missing {
        let first = sgdb.assets(sgdb_id, kind).await?.into_iter().next();
        let ok = match first {
            Some(opt) => download(state, &job.game_id, kind, &opt.url).await.is_ok(),
            None => false,
        };
        if !ok {
            left.push(kind);
        }
    }
    Ok(left)
}
