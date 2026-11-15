use std::fs;
use std::path::PathBuf;

use serde::Deserialize;

use super::util::{open_key, read_str, HKLM};
use super::StoreScanner;
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct Epic;

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Manifest {
    display_name: String,
    install_location: Option<String>,
    app_name: String,
    catalog_namespace: Option<String>,
    catalog_item_id: Option<String>,
    main_game_app_name: Option<String>,
    #[serde(default)]
    app_categories: Vec<String>,
    #[serde(default, rename = "bIsIncompleteInstall")]
    b_is_incomplete_install: bool,
}

fn manifests_dir() -> PathBuf {
    // La ruta puede estar redirigida en el registro; si no, la ubicación por defecto.
    open_key(HKLM, r"SOFTWARE\Epic Games\EpicGamesLauncher")
        .and_then(|k| read_str(&k, "AppDataPath"))
        .map(|p| PathBuf::from(p).join("Manifests"))
        .filter(|p| p.exists())
        .unwrap_or_else(|| PathBuf::from(r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests"))
}

impl StoreScanner for Epic {
    fn store(&self) -> Store {
        Store::Epic
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let Ok(dir) = fs::read_dir(manifests_dir()) else { return Ok(vec![]) };
        let mut games = Vec::new();
        for entry in dir.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("item") {
                continue;
            }
            let Ok(text) = fs::read_to_string(&path) else { continue };
            let Ok(m) = serde_json::from_str::<Manifest>(&text) else { continue };

            let is_dlc = m.main_game_app_name.as_deref().is_some_and(|main| main != m.app_name);
            let is_game = m.app_categories.is_empty() || m.app_categories.iter().any(|c| c == "games");
            if is_dlc || !is_game || m.b_is_incomplete_install {
                continue;
            }

            let id = match (&m.catalog_namespace, &m.catalog_item_id) {
                (Some(ns), Some(item)) => format!("{ns}%3A{item}%3A{}", m.app_name),
                _ => m.app_name.clone(),
            };
            games.push(DetectedGame {
                store: Store::Epic,
                store_id: m.app_name.clone(),
                title: m.display_name,
                install_path: m.install_location,
                launch: LaunchTarget::Uri {
                    uri: format!("com.epicgames.launcher://apps/{id}?action=launch&silent=true"),
                },
            });
        }
        Ok(games)
    }
}
