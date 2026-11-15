//! Copias de seguridad de partidas guardadas. Las rutas de guardado salen del manifiesto comunitario
//! de Ludusavi (misma base que PCGamingWiki); se descarga una vez y se refresca cada semana.
//! Las copias van a `<destino>/<juego>/<AAAAMMDD-HHMMSS>/<n>/...` con un `backup.json` que recuerda
//! la ruta original de cada raíz, para poder restaurar.

pub mod manifest;

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::library::now_ms;
use crate::models::{Game, Store};
use crate::state::AppState;

const KEEP_BACKUPS: usize = 5;
/// Archivos individuales por encima de este tamaño no se copian (vídeos, cachés…).
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveBackup {
    pub name: String,
    pub created_at: i64,
    pub files: usize,
    pub bytes: u64,
    pub path: String,
}

#[derive(Serialize, Deserialize)]
struct BackupMeta {
    created_at: i64,
    files: usize,
    bytes: u64,
    /// índice de carpeta → ruta original
    roots: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInfo {
    /// Rutas de guardado detectadas que existen en este PC.
    pub paths: Vec<String>,
    pub backups: Vec<SaveBackup>,
    pub destination: String,
}

fn safe_name(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect()
}

pub fn destination(state: &AppState) -> PathBuf {
    state
        .db
        .get_setting("savesDir")
        .ok()
        .flatten()
        .and_then(|v| v.as_str().map(PathBuf::from))
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| state.art_dir.parent().unwrap_or(&state.art_dir).join("saves"))
}

/// Rutas de guardado del juego que existen en disco.
pub fn save_paths(state: &AppState, game: &Game) -> AppResult<Vec<String>> {
    let m = manifest::get(state)?;
    let steam_id = game.sources.iter().find(|s| s.store == Store::Steam).map(|s| s.store_id.as_str());
    let install = game.sources.iter().find_map(|s| s.install_path.as_deref());
    let title = game.custom_title.as_deref().unwrap_or(&game.title);
    Ok(m.resolve_paths(title, steam_id, install))
}

fn stamp(ms: i64) -> String {
    // AAAAMMDD-HHMMSS en UTC (solo necesita ser único y ordenable)
    let secs = ms / 1000;
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // Algoritmo civil (Howard Hinnant) para días → fecha
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}", rem / 3600, (rem % 3600) / 60, rem % 60)
}

fn copy_tree(src: &Path, dest: &Path, files: &mut usize, bytes: &mut u64) -> AppResult<()> {
    if src.is_file() {
        let len = fs::metadata(src)?.len();
        if len > MAX_FILE_BYTES {
            return Ok(());
        }
        if let Some(p) = dest.parent() {
            fs::create_dir_all(p)?;
        }
        fs::copy(src, dest)?;
        *files += 1;
        *bytes += len;
        return Ok(());
    }
    if src.is_dir() {
        fs::create_dir_all(dest)?;
        for e in fs::read_dir(src)?.flatten() {
            let p = e.path();
            let name = e.file_name();
            copy_tree(&p, &dest.join(name), files, bytes)?;
        }
    }
    Ok(())
}

pub fn backup(state: &AppState, game: &Game) -> AppResult<SaveBackup> {
    let paths = save_paths(state, game)?;
    if paths.is_empty() {
        return Err(AppError::msg("No se conocen rutas de guardado para este juego (o aún no hay partidas)"));
    }
    let now = now_ms();
    let name = stamp(now);
    let dir = destination(state).join(safe_name(&game.id)).join(&name);
    fs::create_dir_all(&dir)?;

    let (mut files, mut bytes) = (0usize, 0u64);
    for (i, p) in paths.iter().enumerate() {
        copy_tree(Path::new(p), &dir.join(i.to_string()), &mut files, &mut bytes)?;
    }
    if files == 0 {
        let _ = fs::remove_dir_all(&dir);
        return Err(AppError::msg("Las rutas de guardado existen pero están vacías"));
    }
    let meta = BackupMeta { created_at: now, files, bytes, roots: paths.clone() };
    fs::write(dir.join("backup.json"), serde_json::to_string_pretty(&meta)?)?;
    prune(&dir.parent().unwrap_or(&dir).to_path_buf());

    Ok(SaveBackup { name, created_at: now, files, bytes, path: dir.to_string_lossy().into_owned() })
}

/// Borra las copias más antiguas dejando `KEEP_BACKUPS`.
fn prune(game_dir: &PathBuf) {
    let mut entries: Vec<PathBuf> = fs::read_dir(game_dir)
        .map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect())
        .unwrap_or_default();
    entries.sort();
    while entries.len() > KEEP_BACKUPS {
        let _ = fs::remove_dir_all(entries.remove(0));
    }
}

pub fn list(state: &AppState, game_id: &str) -> Vec<SaveBackup> {
    let game_dir = destination(state).join(safe_name(game_id));
    let mut out: Vec<SaveBackup> = fs::read_dir(&game_dir)
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let p = e.path();
                    let meta: BackupMeta = serde_json::from_str(&fs::read_to_string(p.join("backup.json")).ok()?).ok()?;
                    Some(SaveBackup {
                        name: e.file_name().to_string_lossy().into_owned(),
                        created_at: meta.created_at,
                        files: meta.files,
                        bytes: meta.bytes,
                        path: p.to_string_lossy().into_owned(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    out
}

pub fn restore(state: &AppState, game_id: &str, name: &str) -> AppResult<usize> {
    if name.contains(['/', '\\', '.']) {
        return Err(AppError::msg("Nombre de copia no válido"));
    }
    let dir = destination(state).join(safe_name(game_id)).join(name);
    let meta: BackupMeta = serde_json::from_str(&fs::read_to_string(dir.join("backup.json"))?)?;
    let (mut files, mut bytes) = (0usize, 0u64);
    for (i, root) in meta.roots.iter().enumerate() {
        let src = dir.join(i.to_string());
        if src.exists() {
            copy_tree(&src, Path::new(root), &mut files, &mut bytes)?;
        }
    }
    Ok(files)
}

pub fn info(state: &AppState, game: &Game) -> AppResult<SaveInfo> {
    Ok(SaveInfo {
        paths: save_paths(state, game)?,
        backups: list(state, &game.id),
        destination: destination(state).to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamps_dates() {
        assert_eq!(stamp(0), "19700101-000000");
        assert_eq!(stamp(1_700_000_000_000), "20231114-221320");
    }
}
