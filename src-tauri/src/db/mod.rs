//! Persistencia en SQLite. Todo acceso pasa por `Db`, que protege la conexión con un Mutex.
//! Regla: no mantener el lock a través de un `.await`.

use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, AppResult};
use crate::library::{game_id_for, now_ms};
use crate::models::*;

pub struct Db {
    conn: Mutex<Connection>,
}

/// Juego pendiente de descargar arte automáticamente.
pub struct ArtJob {
    pub game_id: String,
    pub title: String,
    pub steam_appid: Option<String>,
    pub sgdb_id: Option<i64>,
    pub missing: Vec<ArtKind>,
}

impl Db {
    pub fn open(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(include_str!("schema.sql"))?;
        Ok(Db { conn: Mutex::new(conn) })
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    // ---------------------------------------------------------------- lectura

    pub fn load_games(&self) -> AppResult<Vec<Game>> {
        let conn = self.conn();

        let mut sources: HashMap<String, Vec<GameSource>> = HashMap::new();
        {
            let mut st = conn.prepare(
                "SELECT id, game_id, store, store_id, title, install_path, launch FROM sources",
            )?;
            let rows = st.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, Option<String>>(5)?,
                    r.get::<_, String>(6)?,
                ))
            })?;
            for row in rows {
                let (id, game_id, store, store_id, title, install_path, launch) = row?;
                let (Some(store), Ok(launch)) =
                    (Store::parse(&store), serde_json::from_str::<LaunchTarget>(&launch))
                else {
                    continue;
                };
                sources.entry(game_id).or_default().push(GameSource {
                    id,
                    store,
                    store_id,
                    title,
                    install_path,
                    launch,
                });
            }
        }

        let mut colls: HashMap<String, Vec<String>> = HashMap::new();
        {
            let mut st = conn.prepare("SELECT game_id, collection_id FROM collection_games")?;
            let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            for row in rows {
                let (g, c) = row?;
                colls.entry(g).or_default().push(c);
            }
        }

        let mut st = conn.prepare(
            "SELECT id, title, custom_title, favorite, hidden, last_played, play_count, added_at,
                    preferred_source, sgdb_id, art_cover, art_hero, art_logo, art_icon, art_version
             FROM games",
        )?;
        let rows = st.query_map([], |r| {
            Ok(Game {
                id: r.get(0)?,
                title: r.get(1)?,
                custom_title: r.get(2)?,
                favorite: r.get::<_, i64>(3)? != 0,
                hidden: r.get::<_, i64>(4)? != 0,
                last_played: r.get(5)?,
                play_count: r.get(6)?,
                added_at: r.get(7)?,
                preferred_source: r.get(8)?,
                sgdb_id: r.get(9)?,
                artwork: Artwork {
                    cover: r.get(10)?,
                    hero: r.get(11)?,
                    logo: r.get(12)?,
                    icon: r.get(13)?,
                },
                artwork_version: r.get(14)?,
                sources: vec![],
                collections: vec![],
            })
        })?;

        let mut games = Vec::new();
        for g in rows {
            let mut g = g?;
            g.sources = sources.remove(&g.id).unwrap_or_default();
            g.collections = colls.remove(&g.id).unwrap_or_default();
            games.push(g);
        }
        Ok(games)
    }

    pub fn get_game(&self, id: &str) -> AppResult<Game> {
        self.load_games()?
            .into_iter()
            .find(|g| g.id == id)
            .ok_or_else(|| AppError::msg(format!("Juego no encontrado: {id}")))
    }

    // ---------------------------------------------------------------- escaneo

    /// Sincroniza el resultado de los scanners con la BD.
    /// `scanned_stores` indica qué tiendas se escanearon con éxito: solo se eliminan
    /// fuentes de esas tiendas (si un scanner falla no se borra su biblioteca).
    pub fn apply_scan(
        &self,
        detected: &[DetectedGame],
        scanned_stores: &HashSet<Store>,
    ) -> AppResult<(usize, usize)> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let now = now_ms();

        let existing_games: HashSet<String> = {
            let mut st = tx.prepare("SELECT id FROM games")?;
            let ids = st.query_map([], |r| r.get::<_, String>(0))?;
            ids.collect::<Result<_, _>>()?
        };

        let mut seen_sources = HashSet::new();
        let mut added = 0;

        for d in detected {
            let source_id = format!("{}:{}", d.store.as_str(), d.store_id);
            seen_sources.insert(source_id.clone());

            // Si la fuente ya existe se respeta su juego actual (puede haberse fusionado a mano).
            let game_id: String = tx
                .query_row("SELECT game_id FROM sources WHERE id = ?1", [&source_id], |r| r.get(0))
                .optional()?
                .unwrap_or_else(|| game_id_for(&d.title));

            if !existing_games.contains(&game_id) {
                let inserted = tx.execute(
                    "INSERT OR IGNORE INTO games (id, title, added_at) VALUES (?1, ?2, ?3)",
                    params![game_id, d.title, now],
                )?;
                added += inserted;
            }

            tx.execute(
                "INSERT INTO sources (id, game_id, store, store_id, title, install_path, launch)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    install_path = excluded.install_path,
                    launch = excluded.launch",
                params![
                    source_id,
                    game_id,
                    d.store.as_str(),
                    d.store_id,
                    d.title,
                    d.install_path,
                    serde_json::to_string(&d.launch)?
                ],
            )?;
        }

        // Elimina fuentes desinstaladas de las tiendas escaneadas.
        let mut removed_sources = Vec::new();
        {
            let mut st = tx.prepare("SELECT id, store FROM sources")?;
            let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            for row in rows {
                let (id, store) = row?;
                let Some(store) = Store::parse(&store) else { continue };
                if store != Store::Manual && scanned_stores.contains(&store) && !seen_sources.contains(&id) {
                    removed_sources.push(id);
                }
            }
        }
        for id in &removed_sources {
            tx.execute("DELETE FROM sources WHERE id = ?1", [id])?;
        }
        // Juegos que se quedan sin ninguna fuente desaparecen.
        let removed = tx.execute(
            "DELETE FROM games WHERE id NOT IN (SELECT DISTINCT game_id FROM sources)",
            [],
        )?;

        tx.commit()?;
        Ok((added, removed))
    }

    pub fn add_manual_game(&self, title: &str, exe: &str) -> AppResult<String> {
        let now = now_ms();
        let game_id = format!("m:{now}");
        let cwd = Path::new(exe).parent().map(|p| p.to_string_lossy().into_owned());
        let launch = LaunchTarget::Exe { path: exe.to_string(), args: vec![], cwd: cwd.clone() };
        let conn = self.conn();
        conn.execute(
            "INSERT INTO games (id, title, added_at) VALUES (?1, ?2, ?3)",
            params![game_id, title, now],
        )?;
        conn.execute(
            "INSERT INTO sources (id, game_id, store, store_id, title, install_path, launch)
             VALUES (?1, ?2, 'manual', ?3, ?4, ?5, ?6)",
            params![
                format!("manual:{now}"),
                game_id,
                now.to_string(),
                title,
                cwd,
                serde_json::to_string(&launch)?
            ],
        )?;
        Ok(game_id)
    }

    pub fn remove_game(&self, id: &str) -> AppResult<()> {
        self.conn().execute("DELETE FROM games WHERE id = ?1", [id])?;
        Ok(())
    }

    // ---------------------------------------------------------------- edición

    pub fn set_favorite(&self, id: &str, v: bool) -> AppResult<()> {
        self.conn().execute("UPDATE games SET favorite = ?2 WHERE id = ?1", params![id, v as i64])?;
        Ok(())
    }

    pub fn set_hidden(&self, id: &str, v: bool) -> AppResult<()> {
        self.conn().execute("UPDATE games SET hidden = ?2 WHERE id = ?1", params![id, v as i64])?;
        Ok(())
    }

    pub fn set_custom_title(&self, id: &str, title: Option<&str>) -> AppResult<()> {
        let title = title.map(str::trim).filter(|t| !t.is_empty());
        self.conn().execute("UPDATE games SET custom_title = ?2 WHERE id = ?1", params![id, title])?;
        Ok(())
    }

    pub fn set_preferred_source(&self, id: &str, source: Option<&str>) -> AppResult<()> {
        self.conn()
            .execute("UPDATE games SET preferred_source = ?2 WHERE id = ?1", params![id, source])?;
        Ok(())
    }

    pub fn record_launch(&self, id: &str) -> AppResult<()> {
        self.conn().execute(
            "UPDATE games SET last_played = ?2, play_count = play_count + 1 WHERE id = ?1",
            params![id, now_ms()],
        )?;
        Ok(())
    }

    // ---------------------------------------------------------------- arte

    pub fn set_art(&self, id: &str, kind: ArtKind, path: Option<&str>) -> AppResult<()> {
        let sql = format!(
            "UPDATE games SET {} = ?2, art_version = ?3 WHERE id = ?1",
            kind.column()
        );
        self.conn().execute(&sql, params![id, path, now_ms()])?;
        Ok(())
    }

    pub fn set_sgdb_id(&self, id: &str, sgdb_id: Option<i64>) -> AppResult<()> {
        self.conn().execute("UPDATE games SET sgdb_id = ?2 WHERE id = ?1", params![id, sgdb_id])?;
        Ok(())
    }

    pub fn mark_art_fetched(&self, id: &str, fetched: bool) -> AppResult<()> {
        self.conn()
            .execute("UPDATE games SET art_fetched = ?2 WHERE id = ?1", params![id, fetched as i64])?;
        Ok(())
    }

    /// Reinicia la marca de descarga para reintentar el arte que falte (p. ej. tras poner la API key).
    pub fn reset_art_fetched_for_missing(&self) -> AppResult<()> {
        self.conn().execute(
            "UPDATE games SET art_fetched = 0
             WHERE art_cover IS NULL OR art_hero IS NULL OR art_logo IS NULL OR art_icon IS NULL",
            [],
        )?;
        Ok(())
    }

    pub fn art_jobs(&self) -> AppResult<Vec<ArtJob>> {
        let conn = self.conn();
        let mut st = conn.prepare(
            "SELECT g.id, COALESCE(g.custom_title, g.title), g.sgdb_id,
                    g.art_cover, g.art_hero, g.art_logo, g.art_icon,
                    (SELECT s.store_id FROM sources s WHERE s.game_id = g.id AND s.store = 'steam' LIMIT 1)
             FROM games g WHERE g.art_fetched = 0",
        )?;
        let rows = st.query_map([], |r| {
            let mut missing = Vec::new();
            for (i, k) in ArtKind::ALL.iter().enumerate() {
                if r.get::<_, Option<String>>(3 + i)?.is_none() {
                    missing.push(*k);
                }
            }
            Ok(ArtJob {
                game_id: r.get(0)?,
                title: r.get(1)?,
                sgdb_id: r.get(2)?,
                steam_appid: r.get(7)?,
                missing,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    // ---------------------------------------------------------------- colecciones

    pub fn list_collections(&self) -> AppResult<Vec<Collection>> {
        let conn = self.conn();
        let mut st = conn.prepare("SELECT id, name, sort FROM collections ORDER BY sort, name")?;
        let rows = st.query_map([], |r| Ok(Collection { id: r.get(0)?, name: r.get(1)?, sort: r.get(2)? }))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn create_collection(&self, name: &str) -> AppResult<Collection> {
        let id = format!("c:{}", now_ms());
        let conn = self.conn();
        let sort: i64 = conn.query_row("SELECT COALESCE(MAX(sort), 0) + 1 FROM collections", [], |r| r.get(0))?;
        conn.execute(
            "INSERT INTO collections (id, name, sort) VALUES (?1, ?2, ?3)",
            params![id, name.trim(), sort],
        )?;
        Ok(Collection { id, name: name.trim().to_string(), sort })
    }

    pub fn rename_collection(&self, id: &str, name: &str) -> AppResult<()> {
        self.conn()
            .execute("UPDATE collections SET name = ?2 WHERE id = ?1", params![id, name.trim()])?;
        Ok(())
    }

    pub fn delete_collection(&self, id: &str) -> AppResult<()> {
        self.conn().execute("DELETE FROM collections WHERE id = ?1", [id])?;
        Ok(())
    }

    pub fn set_in_collection(&self, collection_id: &str, game_id: &str, member: bool) -> AppResult<()> {
        let conn = self.conn();
        if member {
            conn.execute(
                "INSERT OR IGNORE INTO collection_games (collection_id, game_id) VALUES (?1, ?2)",
                params![collection_id, game_id],
            )?;
        } else {
            conn.execute(
                "DELETE FROM collection_games WHERE collection_id = ?1 AND game_id = ?2",
                params![collection_id, game_id],
            )?;
        }
        Ok(())
    }

    // ---------------------------------------------------------------- ajustes

    pub fn get_setting(&self, key: &str) -> AppResult<Option<serde_json::Value>> {
        let v: Option<String> = self
            .conn()
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0))
            .optional()?;
        Ok(v.and_then(|s| serde_json::from_str(&s).ok()))
    }

    pub fn set_setting(&self, key: &str, value: &serde_json::Value) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, serde_json::to_string(value)?],
        )?;
        Ok(())
    }

    pub fn all_settings(&self) -> AppResult<serde_json::Map<String, serde_json::Value>> {
        let conn = self.conn();
        let mut st = conn.prepare("SELECT key, value FROM settings")?;
        let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut map = serde_json::Map::new();
        for row in rows {
            let (k, v) = row?;
            if let Ok(v) = serde_json::from_str(&v) {
                map.insert(k, v);
            }
        }
        Ok(map)
    }

    pub fn sgdb_api_key(&self) -> Option<String> {
        self.get_setting("sgdbApiKey")
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(str::to_string))
            .filter(|s| !s.trim().is_empty())
    }
}
