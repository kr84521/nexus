//! Orquesta los scanners y fusiona sus resultados.
//! Las instalaciones de varias tiendas con el mismo título normalizado se agrupan en un único juego.

use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::Db;
use crate::error::AppResult;
use crate::models::{DetectedGame, ScanReport, Store};
use crate::scanners;

/// Calcula en un hilo el tamaño de cada carpeta de instalación y emite `library-changed` al acabar.
pub fn spawn_compute_sizes(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use tauri::{Emitter, Manager};
        let state = app.state::<crate::state::AppState>();
        let Ok(paths) = state.db.source_paths() else { return };
        let mut changed = false;
        for (id, path) in paths {
            let bytes = dir_size(std::path::Path::new(&path)) as i64;
            if state.db.set_source_size(&id, bytes).is_ok() {
                changed = true;
            }
        }
        if changed {
            let _ = app.emit("library-changed", ());
        }
    });
}

fn dir_size(dir: &std::path::Path) -> u64 {
    let mut total = 0;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(d) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&d) else { continue };
        for e in rd.flatten() {
            let Ok(meta) = e.metadata() else { continue };
            if meta.is_dir() {
                stack.push(e.path());
            } else {
                total += meta.len();
            }
        }
    }
    total
}

/// Palabras de edición que no distinguen un juego de otro.
const EDITION_WORDS: &[&str] = &[
    "deluxeedition", "deluxe", "edition", "goty", "gameoftheyear", "remastered", "definitive", "ultimate",
    "complete", "enhanced", "directorscut", "gold", "premium", "digital", "standard", "legendary", "anniversary",
];

fn core_title(normalized: &str) -> String {
    let mut s = normalized.to_string();
    for w in EDITION_WORDS {
        s = s.replace(w, "");
    }
    s
}

/// Pares de juegos de tiendas distintas cuyos títulos parecen el mismo juego.
pub fn merge_suggestions(games: &[crate::models::Game], ignored: &[String]) -> Vec<crate::models::MergeSuggestion> {
    let mut out = Vec::new();
    let keys: Vec<(String, String)> = games
        .iter()
        .map(|g| {
            let n = normalize_title(g.custom_title.as_deref().unwrap_or(&g.title));
            (n.clone(), core_title(&n))
        })
        .collect();
    for i in 0..games.len() {
        for j in (i + 1)..games.len() {
            let (a, b) = (&games[i], &games[j]);
            if a.hidden || b.hidden {
                continue;
            }
            let stores_a: std::collections::HashSet<_> = a.sources.iter().map(|s| s.store).collect();
            if b.sources.iter().any(|s| stores_a.contains(&s.store)) {
                continue; // misma tienda: no son el mismo juego
            }
            let (na, ca) = &keys[i];
            let (nb, cb) = &keys[j];
            let shorter = na.len().min(nb.len());
            let similar = (ca == cb && !ca.is_empty())
                || (shorter >= 5 && (na.starts_with(nb.as_str()) || nb.starts_with(na.as_str())) && na.len().abs_diff(nb.len()) <= 14);
            if !similar {
                continue;
            }
            let key = format!("{}|{}", a.id, b.id);
            let key_rev = format!("{}|{}", b.id, a.id);
            if ignored.iter().any(|k| k == &key || k == &key_rev) {
                continue;
            }
            out.push(crate::models::MergeSuggestion { a: a.id.clone(), b: b.id.clone() });
        }
    }
    out
}

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// "DOOM Eternal™ — Deluxe Edition" → "doometernaldeluxeedition"
pub fn normalize_title(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

pub fn game_id_for(title: &str) -> String {
    let n = normalize_title(title);
    if n.is_empty() {
        format!("g:{}", title.trim().to_lowercase())
    } else {
        format!("g:{n}")
    }
}

/// Ejecuta todos los scanners (en paralelo, cada uno en su hilo) y sincroniza la BD.
pub fn scan_all(db: &Db) -> AppResult<ScanReport> {
    let folders: Vec<String> = db
        .get_setting("scanFolders")?
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let emulators = db
        .get_setting("emulators")?
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    let handles: Vec<_> = scanners::all(folders, emulators)
        .into_iter()
        .map(|s| std::thread::spawn(move || (s.store(), s.scan())))
        .collect();

    let mut detected: Vec<DetectedGame> = Vec::new();
    let mut ok_stores = HashSet::new();
    let mut counts: HashMap<Store, usize> = HashMap::new();
    let mut errors = Vec::new();

    for h in handles {
        match h.join() {
            Ok((store, Ok(games))) => {
                ok_stores.insert(store);
                counts.insert(store, games.len());
                detected.extend(games);
            }
            Ok((store, Err(e))) => errors.push(format!("{}: {e}", store.as_str())),
            Err(_) => errors.push("Un scanner falló inesperadamente".into()),
        }
    }

    // Una misma fuente no puede aparecer dos veces.
    let mut seen = HashSet::new();
    detected.retain(|d| seen.insert((d.store, d.store_id.clone())));

    let (added, removed) = db.apply_scan(&detected, &ok_stores)?;
    let mut per_store: Vec<_> = counts.into_iter().collect();
    per_store.sort_by_key(|(s, _)| s.as_str());

    Ok(ScanReport { total: detected.len(), added, removed, per_store, errors })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggests_merges_across_stores() {
        use crate::models::*;
        let mk = |id: &str, title: &str, store: Store| Game {
            id: id.into(),
            title: title.into(),
            custom_title: None,
            favorite: false,
            hidden: false,
            last_played: None,
            play_count: 0,
            added_at: 0,
            preferred_source: None,
            sgdb_id: None,
            artwork: Artwork::default(),
            artwork_version: 0,
            playtime_secs: 0,
            external_playtime_secs: 0,
            status: GameStatus::None,
            rating: 0,
            notes: String::new(),
            art_color: None,
            meta: None,
            launch_options: LaunchOptions::default(),
            sources: vec![GameSource {
                id: format!("{}:{id}", store.as_str()),
                store,
                store_id: id.into(),
                title: title.into(),
                install_path: None,
                launch: LaunchTarget::Uri { uri: String::new() },
                size_bytes: None,
            }],
            collections: vec![],
        };
        let games = vec![
            mk("a", "DOOM Eternal", Store::Steam),
            mk("b", "DOOM Eternal Deluxe Edition", Store::Epic),
            mk("c", "DOOM Eternal", Store::Gog),
            mk("d", "Celeste", Store::Steam),
            mk("e", "Hades II", Store::Epic),
            mk("f", "Hades", Store::Steam),
        ];
        let s = merge_suggestions(&games, &[]);
        let pairs: Vec<String> = s.iter().map(|p| format!("{}|{}", p.a, p.b)).collect();
        assert!(pairs.contains(&"a|b".into()) && pairs.contains(&"a|c".into()) && pairs.contains(&"b|c".into()));
        assert!(pairs.contains(&"e|f".into()), "Hades II / Hades se propone (prefijo corto) y el usuario decide");
        assert!(!pairs.iter().any(|p| p.contains('d')));
        assert!(merge_suggestions(&games, &["b|a".into()]).iter().all(|p| !(p.a == "a" && p.b == "b")));
    }

    #[test]
    fn normalizes_titles() {
        assert_eq!(normalize_title("DOOM Eternal™"), "doometernal");
        assert_eq!(game_id_for("The Witcher 3: Wild Hunt"), game_id_for("The Witcher® 3 - Wild Hunt"));
    }
}
