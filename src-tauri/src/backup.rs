//! Exportar / importar la biblioteca (juegos, colecciones, sesiones, ajustes y arte) a una carpeta.
//! Formato: `<carpeta>/nexus-library.json` + `<carpeta>/artwork/<juego>/...`.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::{Artwork, LaunchOptions};
use crate::state::AppState;

const FILE_NAME: &str = "nexus-library.json";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GameBackup {
    id: String,
    title: String,
    custom_title: Option<String>,
    favorite: bool,
    hidden: bool,
    last_played: Option<i64>,
    play_count: i64,
    added_at: i64,
    preferred_source: Option<String>,
    sgdb_id: Option<i64>,
    playtime_secs: i64,
    /// Rutas relativas dentro de `artwork/` del backup.
    artwork: Artwork,
    launch_options: LaunchOptions,
    collections: Vec<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CollectionBackup {
    id: String,
    name: String,
    sort: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionBackup {
    game_id: String,
    started_at: i64,
    secs: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Backup {
    format: u32,
    exported_at: i64,
    games: Vec<GameBackup>,
    collections: Vec<CollectionBackup>,
    sessions: Vec<SessionBackup>,
    settings: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub games: usize,
    pub collections: usize,
    pub sessions: usize,
    pub artwork_files: usize,
}

fn relative_art(path: &str, art_dir: &Path) -> Option<String> {
    Path::new(path)
        .strip_prefix(art_dir)
        .ok()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}

pub fn export(state: &AppState, dir: &str) -> AppResult<usize> {
    let dir = Path::new(dir);
    fs::create_dir_all(dir)?;
    let games = state.db.load_games()?;
    let sessions = state.db.all_sessions()?;

    let art_out = dir.join("artwork");
    let mut copied = 0usize;
    let mut rel = |p: &Option<String>| -> Option<String> {
        let p = p.as_deref()?;
        let r = relative_art(p, &state.art_dir)?;
        let dest = art_out.join(&r);
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::copy(p, &dest).is_ok() {
            copied += 1;
            Some(r)
        } else {
            None
        }
    };

    let games_backup: Vec<GameBackup> = games
        .iter()
        .map(|g| GameBackup {
            id: g.id.clone(),
            title: g.title.clone(),
            custom_title: g.custom_title.clone(),
            favorite: g.favorite,
            hidden: g.hidden,
            last_played: g.last_played,
            play_count: g.play_count,
            added_at: g.added_at,
            preferred_source: g.preferred_source.clone(),
            sgdb_id: g.sgdb_id,
            playtime_secs: g.playtime_secs,
            artwork: Artwork {
                cover: rel(&g.artwork.cover),
                hero: rel(&g.artwork.hero),
                logo: rel(&g.artwork.logo),
                icon: rel(&g.artwork.icon),
            },
            launch_options: g.launch_options.clone(),
            collections: g.collections.clone(),
        })
        .collect();

    let backup = Backup {
        format: 1,
        exported_at: crate::library::now_ms(),
        games: games_backup,
        collections: state
            .db
            .list_collections()?
            .into_iter()
            .map(|c| CollectionBackup { id: c.id, name: c.name, sort: c.sort })
            .collect(),
        sessions: sessions.into_iter().map(|(game_id, started_at, secs)| SessionBackup { game_id, started_at, secs }).collect(),
        settings: state.db.all_settings()?,
    };
    fs::write(dir.join(FILE_NAME), serde_json::to_string_pretty(&backup)?)?;
    Ok(games.len())
}

pub fn import(state: &AppState, dir: &str) -> AppResult<ImportReport> {
    let dir = Path::new(dir);
    let file = if dir.is_file() { dir.to_path_buf() } else { dir.join(FILE_NAME) };
    let base: PathBuf = file.parent().map(Path::to_path_buf).unwrap_or_default();
    let backup: Backup = serde_json::from_str(&fs::read_to_string(&file).map_err(|_| {
        AppError::msg(format!("No se encontró {FILE_NAME} en la carpeta elegida"))
    })?)?;
    if backup.format != 1 {
        return Err(AppError::msg("Formato de copia no reconocido"));
    }

    // Arte: se copia a la carpeta de arte actual y se traducen las rutas.
    let mut copied = 0usize;
    let mut abs = |rel: &Option<String>| -> Option<String> {
        let rel = rel.as_deref()?;
        let src = base.join("artwork").join(rel);
        let dest = state.art_dir.join(rel);
        if let Some(parent) = dest.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::copy(&src, &dest).is_ok() {
            copied += 1;
            Some(dest.to_string_lossy().into_owned())
        } else {
            None
        }
    };

    let mut conn = state.db.conn_for_stats();
    let tx = conn.transaction()?;
    for c in &backup.collections {
        tx.execute(
            "INSERT INTO collections (id, name, sort) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort = excluded.sort",
            params![c.id, c.name, c.sort],
        )?;
    }
    let mut games = 0usize;
    for g in &backup.games {
        let art = Artwork {
            cover: abs(&g.artwork.cover),
            hero: abs(&g.artwork.hero),
            logo: abs(&g.artwork.logo),
            icon: abs(&g.artwork.icon),
        };
        // Si el juego ya existe (mismo id, p. ej. tras reescanear) se conservan sus fuentes y se
        // restauran los datos del usuario; si no, se crea sin fuentes (aparecerá al escanear).
        tx.execute(
            "INSERT INTO games (id, title, custom_title, favorite, hidden, last_played, play_count, added_at,
                                preferred_source, sgdb_id, playtime_secs, art_cover, art_hero, art_logo, art_icon,
                                art_version, art_fetched)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, 1)
             ON CONFLICT(id) DO UPDATE SET
                custom_title = excluded.custom_title, favorite = excluded.favorite, hidden = excluded.hidden,
                last_played = MAX(COALESCE(games.last_played, 0), COALESCE(excluded.last_played, 0)),
                play_count = MAX(games.play_count, excluded.play_count),
                preferred_source = COALESCE(excluded.preferred_source, games.preferred_source),
                sgdb_id = COALESCE(excluded.sgdb_id, games.sgdb_id),
                playtime_secs = MAX(games.playtime_secs, excluded.playtime_secs),
                art_cover = COALESCE(excluded.art_cover, games.art_cover),
                art_hero = COALESCE(excluded.art_hero, games.art_hero),
                art_logo = COALESCE(excluded.art_logo, games.art_logo),
                art_icon = COALESCE(excluded.art_icon, games.art_icon),
                art_version = excluded.art_version",
            params![
                g.id, g.title, g.custom_title, g.favorite as i64, g.hidden as i64, g.last_played, g.play_count,
                g.added_at, g.preferred_source, g.sgdb_id, g.playtime_secs,
                art.cover, art.hero, art.logo, art.icon, crate::library::now_ms()
            ],
        )?;
        tx.execute("UPDATE games SET last_played = NULL WHERE id = ?1 AND last_played = 0", [&g.id])?;
        tx.execute(
            "INSERT INTO launch_options (game_id, args, pre_command, post_command, close_store_on_exit, run_as_admin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(game_id) DO UPDATE SET args = excluded.args, pre_command = excluded.pre_command,
                post_command = excluded.post_command, close_store_on_exit = excluded.close_store_on_exit,
                run_as_admin = excluded.run_as_admin",
            params![
                g.id, g.launch_options.args, g.launch_options.pre_command, g.launch_options.post_command,
                g.launch_options.close_store_on_exit as i64, g.launch_options.run_as_admin as i64
            ],
        )?;
        for c in &g.collections {
            tx.execute(
                "INSERT OR IGNORE INTO collection_games (collection_id, game_id) VALUES (?1, ?2)",
                params![c, g.id],
            )?;
        }
        games += 1;
    }
    // Sesiones: solo las que no existan ya (misma hora de inicio).
    let mut sessions = 0usize;
    for s in &backup.sessions {
        let n = tx.execute(
            "INSERT INTO sessions (game_id, started_at, secs)
             SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE game_id = ?1 AND started_at = ?2)
               AND EXISTS (SELECT 1 FROM games WHERE id = ?1)",
            params![s.game_id, s.started_at, s.secs],
        )?;
        sessions += n;
    }
    for (k, v) in &backup.settings {
        tx.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![k, serde_json::to_string(v)?],
        )?;
    }
    tx.commit()?;
    drop(conn);

    // Las portadas importadas quedan sin art_color; se recalcula.
    crate::artwork::backfill_colors(state);

    Ok(ImportReport { games, collections: backup.collections.len(), sessions, artwork_files: copied })
}
