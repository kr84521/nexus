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

/// Versión actual del esquema (PRAGMA user_version). Súbela al añadir una migración.
const SCHEMA_VERSION: i64 = 4;

/// Migraciones para bases de datos ya existentes. `schema.sql` solo crea lo que falta (IF NOT EXISTS),
/// así que los cambios en tablas existentes (ALTER TABLE) van aquí, una entrada por versión.
fn migrate(conn: &Connection) -> AppResult<()> {
    let mut v: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    // `schema.sql` ya ha creado las tablas que faltaban con todas sus columnas, así que cada
    // ALTER debe comprobar antes si la columna existe (una BD v0 no tenía `metadata`, p. ej.).
    if v < 1 {
        add_column(conn, "games", "playtime_secs", "INTEGER NOT NULL DEFAULT 0")?;
        v = 1;
    }
    if v < 2 {
        add_column(conn, "games", "art_color", "TEXT")?;
        add_column(conn, "games", "meta_fetched", "INTEGER NOT NULL DEFAULT 0")?;
        v = 2;
    }
    if v < 3 {
        add_column(conn, "games", "external_playtime_secs", "INTEGER NOT NULL DEFAULT 0")?;
        add_column(conn, "games", "status", "TEXT NOT NULL DEFAULT 'none'")?;
        add_column(conn, "games", "rating", "INTEGER NOT NULL DEFAULT 0")?;
        add_column(conn, "games", "notes", "TEXT NOT NULL DEFAULT ''")?;
        v = 3;
    }
    if v < 4 {
        // Metacritic: los metadatos se vuelven a descargar para rellenarlo.
        if add_column(conn, "metadata", "metacritic", "INTEGER")? {
            conn.execute_batch("UPDATE games SET meta_fetched = 0;")?;
        }
        v = 4;
    }
    conn.pragma_update(None, "user_version", v)?;
    Ok(())
}

/// Añade la columna si no existe. Devuelve `true` si la ha añadido.
fn add_column(conn: &Connection, table: &str, column: &str, decl: &str) -> AppResult<bool> {
    let exists = conn
        .prepare(&format!("PRAGMA table_info({table})"))?
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(Result::ok)
        .any(|c| c == column);
    if exists {
        return Ok(false);
    }
    conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl};"))?;
    Ok(true)
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
        let fresh: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'games'",
            [],
            |r| r.get(0),
        )?;
        conn.execute_batch(include_str!("schema.sql"))?;
        if fresh == 0 {
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        } else {
            migrate(&conn)?;
        }
        Ok(Db { conn: Mutex::new(conn) })
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Acceso de solo lectura para consultas agregadas (módulo `stats`). No mantener a través de `.await`.
    pub fn conn_for_stats(&self) -> MutexGuard<'_, Connection> {
        self.conn()
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

        let mut meta: HashMap<String, Metadata> = HashMap::new();
        {
            let mut st = conn.prepare(
                "SELECT game_id, steam_appid, description, genres, release_year, developer, publisher,
                        trailer_url, trailer_poster, metacritic FROM metadata",
            )?;
            let rows = st.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    Metadata {
                        steam_appid: r.get(1)?,
                        description: r.get(2)?,
                        genres: serde_json::from_str(&r.get::<_, String>(3)?).unwrap_or_default(),
                        release_year: r.get(4)?,
                        developer: r.get(5)?,
                        publisher: r.get(6)?,
                        trailer_url: r.get(7)?,
                        trailer_poster: r.get(8)?,
                        metacritic: r.get(9)?,
                    },
                ))
            })?;
            for row in rows {
                let (id, m) = row?;
                meta.insert(id, m);
            }
        }

        let mut opts: HashMap<String, LaunchOptions> = HashMap::new();
        {
            let mut st = conn.prepare(
                "SELECT game_id, args, pre_command, post_command, close_store_on_exit, run_as_admin FROM launch_options",
            )?;
            let rows = st.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    LaunchOptions {
                        args: r.get(1)?,
                        pre_command: r.get(2)?,
                        post_command: r.get(3)?,
                        close_store_on_exit: r.get::<_, i64>(4)? != 0,
                        run_as_admin: r.get::<_, i64>(5)? != 0,
                    },
                ))
            })?;
            for row in rows {
                let (id, o) = row?;
                opts.insert(id, o);
            }
        }

        let mut st = conn.prepare(
            "SELECT id, title, custom_title, favorite, hidden, last_played, play_count, added_at,
                    preferred_source, sgdb_id, art_cover, art_hero, art_logo, art_icon, art_version,
                    playtime_secs, art_color, external_playtime_secs, status, rating, notes
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
                playtime_secs: r.get(15)?,
                art_color: r.get::<_, Option<String>>(16)?.filter(|c| !c.is_empty()),
                external_playtime_secs: r.get(17)?,
                status: GameStatus::parse(&r.get::<_, String>(18)?),
                rating: r.get(19)?,
                notes: r.get(20)?,
                meta: None,
                launch_options: LaunchOptions::default(),
                sources: vec![],
                collections: vec![],
            })
        })?;

        let mut games = Vec::new();
        for g in rows {
            let mut g = g?;
            g.sources = sources.remove(&g.id).unwrap_or_default();
            g.collections = colls.remove(&g.id).unwrap_or_default();
            g.meta = meta.remove(&g.id);
            g.launch_options = opts.remove(&g.id).unwrap_or_default();
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
                // Los juegos añadidos a mano ("manual:<ts>") nunca se borran; los de carpetas
                // escaneadas ("manual:dir:...") sí, igual que los de cualquier tienda.
                let hand_added = store == Store::Manual && !id.starts_with("manual:dir:");
                if !hand_added && scanned_stores.contains(&store) && !seen_sources.contains(&id) {
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

    // ---------------------------------------------------------------- fusionar / separar

    /// Mueve todas las fuentes (y colecciones, tiempo de juego, favorito) de `from` a `into` y borra `from`.
    pub fn merge_games(&self, into: &str, from: &str) -> AppResult<()> {
        if into == from {
            return Err(AppError::msg("No se puede fusionar un juego consigo mismo"));
        }
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute("UPDATE sources SET game_id = ?1 WHERE game_id = ?2", params![into, from])?;
        tx.execute("UPDATE sessions SET game_id = ?1 WHERE game_id = ?2", params![into, from])?;
        tx.execute(
            "INSERT OR IGNORE INTO collection_games (collection_id, game_id)
             SELECT collection_id, ?1 FROM collection_games WHERE game_id = ?2",
            params![into, from],
        )?;
        tx.execute(
            "UPDATE games SET
                playtime_secs = playtime_secs + (SELECT playtime_secs FROM games WHERE id = ?2),
                play_count = play_count + (SELECT play_count FROM games WHERE id = ?2),
                favorite = MAX(favorite, (SELECT favorite FROM games WHERE id = ?2)),
                last_played = MAX(COALESCE(last_played, 0), COALESCE((SELECT last_played FROM games WHERE id = ?2), 0))
             WHERE id = ?1",
            params![into, from],
        )?;
        tx.execute("UPDATE games SET last_played = NULL WHERE id = ?1 AND last_played = 0", [into])?;
        tx.execute(
            "UPDATE games SET
                external_playtime_secs = external_playtime_secs + (SELECT external_playtime_secs FROM games WHERE id = ?2),
                rating = MAX(rating, (SELECT rating FROM games WHERE id = ?2)),
                status = CASE WHEN status = 'none' THEN (SELECT status FROM games WHERE id = ?2) ELSE status END,
                notes = TRIM(notes || CASE WHEN (SELECT notes FROM games WHERE id = ?2) = '' THEN '' ELSE char(10) || (SELECT notes FROM games WHERE id = ?2) END)
             WHERE id = ?1",
            params![into, from],
        )?;
        tx.execute("DELETE FROM games WHERE id = ?1", [from])?;
        tx.commit()?;
        Ok(())
    }

    /// Saca una fuente a un juego nuevo propio. Devuelve el id del juego creado.
    pub fn split_source(&self, source_id: &str) -> AppResult<String> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let (old_game, store, title): (String, String, String) = tx.query_row(
            "SELECT game_id, store, title FROM sources WHERE id = ?1",
            [source_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )?;
        let n: i64 = tx.query_row("SELECT COUNT(*) FROM sources WHERE game_id = ?1", [&old_game], |r| r.get(0))?;
        if n < 2 {
            return Err(AppError::msg("El juego solo tiene una fuente"));
        }
        let new_id = format!("{}#{}", game_id_for(&title), store);
        tx.execute(
            "INSERT OR IGNORE INTO games (id, title, added_at) VALUES (?1, ?2, ?3)",
            params![new_id, title, now_ms()],
        )?;
        tx.execute("UPDATE sources SET game_id = ?1 WHERE id = ?2", params![new_id, source_id])?;
        tx.commit()?;
        Ok(new_id)
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

    pub fn add_session(&self, id: &str, started_at: i64, secs: i64) -> AppResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO sessions (game_id, started_at, secs) VALUES (?1, ?2, ?3)",
            params![id, started_at, secs],
        )?;
        tx.execute(
            "UPDATE games SET playtime_secs = playtime_secs + ?2 WHERE id = ?1",
            params![id, secs],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Todas las sesiones (para exportar): (game_id, started_at, secs).
    pub fn all_sessions(&self) -> AppResult<Vec<(String, i64, i64)>> {
        let conn = self.conn();
        let mut st = conn.prepare("SELECT game_id, started_at, secs FROM sessions ORDER BY started_at")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        Ok(rows.collect::<Result<_, _>>()?)
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

    pub fn set_status(&self, id: &str, status: GameStatus) -> AppResult<()> {
        self.conn().execute("UPDATE games SET status = ?2 WHERE id = ?1", params![id, status.as_str()])?;
        Ok(())
    }

    pub fn set_rating(&self, id: &str, rating: i64) -> AppResult<()> {
        self.conn().execute("UPDATE games SET rating = ?2 WHERE id = ?1", params![id, rating.clamp(0, 5)])?;
        Ok(())
    }

    pub fn set_notes(&self, id: &str, notes: &str) -> AppResult<()> {
        self.conn().execute("UPDATE games SET notes = ?2 WHERE id = ?1", params![id, notes])?;
        Ok(())
    }

    // ---------------------------------------------------------------- Steam (Web API)

    pub fn replace_steam_owned(&self, owned: &[crate::steam_sync::OwnedGame]) -> AppResult<()> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM steam_owned", [])?;
        for g in owned {
            tx.execute(
                "INSERT INTO steam_owned (appid, name, playtime_min, last_played, icon_hash) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    g.appid.to_string(),
                    g.name,
                    g.playtime_forever,
                    (g.rtime_last_played > 0).then(|| g.rtime_last_played * 1000),
                    (!g.img_icon_url.is_empty()).then(|| g.img_icon_url.clone())
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Aplica horas externas (appid, segundos, última partida ms) a los juegos con fuente Steam.
    /// Devuelve (juegos actualizados, segundos externos totales aplicados).
    pub fn apply_external_playtime(&self, items: &[(String, i64, i64)]) -> AppResult<(usize, i64)> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let mut updated = 0;
        let mut total = 0;
        for (appid, secs, last) in items {
            let n = tx.execute(
                "UPDATE games SET
                    playtime_secs = playtime_secs - external_playtime_secs + ?2,
                    external_playtime_secs = ?2,
                    last_played = CASE WHEN ?3 > COALESCE(last_played, 0) THEN ?3 ELSE last_played END
                 WHERE id = (SELECT game_id FROM sources WHERE store = 'steam' AND store_id = ?1 LIMIT 1)
                   AND (external_playtime_secs != ?2 OR ?3 > COALESCE(last_played, 0))",
                params![appid, secs, last],
            )?;
            if n > 0 {
                updated += n;
                total += secs;
            }
        }
        tx.commit()?;
        Ok((updated, total))
    }

    pub fn set_launch_options(&self, id: &str, o: &LaunchOptions) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO launch_options (game_id, args, pre_command, post_command, close_store_on_exit, run_as_admin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(game_id) DO UPDATE SET args = excluded.args, pre_command = excluded.pre_command,
                post_command = excluded.post_command, close_store_on_exit = excluded.close_store_on_exit,
                run_as_admin = excluded.run_as_admin",
            params![
                id,
                o.args.trim(),
                o.pre_command.trim(),
                o.post_command.trim(),
                o.close_store_on_exit as i64,
                o.run_as_admin as i64
            ],
        )?;
        Ok(())
    }

    // ---------------------------------------------------------------- metadatos y color

    /// (id, título, appid de Steam si lo hay) de los juegos sin metadatos descargados.
    pub fn metadata_jobs(&self) -> AppResult<Vec<(String, String, Option<String>)>> {
        let conn = self.conn();
        let mut st = conn.prepare(
            "SELECT g.id, COALESCE(g.custom_title, g.title),
                    (SELECT s.store_id FROM sources s WHERE s.game_id = g.id AND s.store = 'steam' LIMIT 1)
             FROM games g WHERE g.meta_fetched = 0",
        )?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn set_metadata(&self, id: &str, m: &Metadata) -> AppResult<()> {
        self.conn().execute(
            "INSERT INTO metadata (game_id, steam_appid, description, genres, release_year, developer, publisher, trailer_url, trailer_poster,
                                   metacritic)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(game_id) DO UPDATE SET
                steam_appid = COALESCE(excluded.steam_appid, metadata.steam_appid),
                description = COALESCE(excluded.description, metadata.description),
                genres = CASE WHEN excluded.genres = '[]' THEN metadata.genres ELSE excluded.genres END,
                release_year = COALESCE(excluded.release_year, metadata.release_year),
                developer = COALESCE(excluded.developer, metadata.developer),
                publisher = COALESCE(excluded.publisher, metadata.publisher),
                trailer_url = COALESCE(excluded.trailer_url, metadata.trailer_url),
                trailer_poster = COALESCE(excluded.trailer_poster, metadata.trailer_poster),
                metacritic = COALESCE(excluded.metacritic, metadata.metacritic)",
            params![
                id,
                m.steam_appid,
                m.description,
                serde_json::to_string(&m.genres)?,
                m.release_year,
                m.developer,
                m.publisher,
                m.trailer_url,
                m.trailer_poster,
                m.metacritic
            ],
        )?;
        Ok(())
    }

    /// Juegos de la cuenta de Steam sin instalación detectada.
    pub fn steam_owned_not_installed(&self) -> AppResult<Vec<OwnedGame>> {
        let conn = self.conn();
        let mut st = conn.prepare(
            "SELECT o.appid, o.name, o.playtime_min, o.last_played FROM steam_owned o
             WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.store = 'steam' AND s.store_id = o.appid)
             ORDER BY o.name",
        )?;
        let rows = st.query_map([], |r| {
            Ok(OwnedGame { appid: r.get(0)?, name: r.get(1)?, playtime_min: r.get(2)?, last_played: r.get(3)? })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn mark_meta_fetched(&self, id: &str, v: bool) -> AppResult<()> {
        self.conn().execute("UPDATE games SET meta_fetched = ?2 WHERE id = ?1", params![id, v as i64])?;
        Ok(())
    }

    pub fn reset_meta_fetched_for_missing(&self) -> AppResult<()> {
        self.conn().execute(
            "UPDATE games SET meta_fetched = 0 WHERE id NOT IN (SELECT game_id FROM metadata)",
            [],
        )?;
        Ok(())
    }

    pub fn set_art_color(&self, id: &str, color: Option<&str>) -> AppResult<()> {
        self.conn().execute("UPDATE games SET art_color = ?2 WHERE id = ?1", params![id, color])?;
        Ok(())
    }

    /// (id, ruta de portada) de los juegos con portada pero sin color calculado.
    pub fn color_jobs(&self) -> AppResult<Vec<(String, String)>> {
        let conn = self.conn();
        let mut st = conn.prepare("SELECT id, art_cover FROM games WHERE art_cover IS NOT NULL AND art_color IS NULL")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db(name: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("nexus-test-{name}-{}.db", now_ms()));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn fresh_db_starts_at_latest_version() {
        let p = temp_db("fresh");
        let db = Db::open(&p).unwrap();
        let v: i64 = db.conn().pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v, SCHEMA_VERSION);
        assert!(db.load_games().unwrap().is_empty());
    }

    #[test]
    fn migrates_v0_database() {
        let p = temp_db("v0");
        {
            // Esquema de la v0.1.0: sin playtime_secs, art_color ni meta_fetched.
            let c = Connection::open(&p).unwrap();
            c.execute_batch(
                "CREATE TABLE games (id TEXT PRIMARY KEY, title TEXT NOT NULL, custom_title TEXT,
                    favorite INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, last_played INTEGER,
                    play_count INTEGER NOT NULL DEFAULT 0, added_at INTEGER NOT NULL, preferred_source TEXT,
                    sgdb_id INTEGER, art_cover TEXT, art_hero TEXT, art_logo TEXT, art_icon TEXT,
                    art_version INTEGER NOT NULL DEFAULT 0, art_fetched INTEGER NOT NULL DEFAULT 0);
                 CREATE TABLE sources (id TEXT PRIMARY KEY, game_id TEXT NOT NULL, store TEXT NOT NULL,
                    store_id TEXT NOT NULL, title TEXT NOT NULL, install_path TEXT, launch TEXT NOT NULL);
                 INSERT INTO games (id, title, added_at) VALUES ('g:hades', 'Hades', 1);
                 INSERT INTO sources VALUES ('steam:1145360', 'g:hades', 'steam', '1145360', 'Hades', NULL,
                    '{\"kind\":\"uri\",\"uri\":\"steam://rungameid/1145360\"}');",
            )
            .unwrap();
        }
        let db = Db::open(&p).unwrap();
        let v: i64 = db.conn().pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
        assert_eq!(v, SCHEMA_VERSION);

        let games = db.load_games().unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].playtime_secs, 0);
        assert!(games[0].meta.is_none());
        assert_eq!(games[0].sources[0].store, Store::Steam);

        db.add_session("g:hades", 0, 90).unwrap();
        db.set_metadata("g:hades", &Metadata { genres: vec!["Rol".into()], ..Default::default() }).unwrap();
        let g = db.get_game("g:hades").unwrap();
        assert_eq!(g.playtime_secs, 90);
        assert_eq!(g.meta.unwrap().genres, vec!["Rol"]);

        // Reabrir no debe fallar ni volver a migrar.
        drop(db);
        Db::open(&p).unwrap();
    }

    #[test]
    fn merge_and_split_keep_sources() {
        let p = temp_db("merge");
        let db = Db::open(&p).unwrap();
        let detected = vec![
            DetectedGame {
                store: Store::Steam,
                store_id: "1".into(),
                title: "Celeste".into(),
                install_path: None,
                launch: LaunchTarget::Uri { uri: "steam://rungameid/1".into() },
            },
            DetectedGame {
                store: Store::Epic,
                store_id: "cel".into(),
                title: "Celeste Deluxe".into(),
                install_path: None,
                launch: LaunchTarget::Uri { uri: "epic://cel".into() },
            },
        ];
        let stores: HashSet<Store> = [Store::Steam, Store::Epic].into_iter().collect();
        db.apply_scan(&detected, &stores).unwrap();
        assert_eq!(db.load_games().unwrap().len(), 2);

        db.merge_games("g:celeste", "g:celestedeluxe").unwrap();
        let games = db.load_games().unwrap();
        assert_eq!(games.len(), 1);
        assert_eq!(games[0].sources.len(), 2);

        // Un rescaneo respeta la fusión.
        db.apply_scan(&detected, &stores).unwrap();
        assert_eq!(db.load_games().unwrap().len(), 1);

        let new_id = db.split_source("epic:cel").unwrap();
        assert_eq!(new_id, "g:celestedeluxe#epic");
        let games = db.load_games().unwrap();
        assert_eq!(games.len(), 2);
        db.apply_scan(&detected, &stores).unwrap();
        assert_eq!(db.load_games().unwrap().len(), 2, "el rescaneo no debe volver a fusionar");
    }
}
