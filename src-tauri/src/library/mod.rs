//! Orquesta los scanners y fusiona sus resultados.
//! Las instalaciones de varias tiendas con el mismo título normalizado se agrupan en un único juego.

use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::Db;
use crate::error::AppResult;
use crate::models::{DetectedGame, ScanReport, Store};
use crate::scanners;

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
    fn normalizes_titles() {
        assert_eq!(normalize_title("DOOM Eternal™"), "doometernal");
        assert_eq!(game_id_for("The Witcher 3: Wild Hunt"), game_id_for("The Witcher® 3 - Wild Hunt"));
    }
}
