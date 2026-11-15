use std::collections::HashMap;
use std::path::Path;

use super::util::{open_key, read_str, subkeys, uninstall_entries, HKLM};
use super::StoreScanner;
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct Ubisoft;

impl StoreScanner for Ubisoft {
    fn store(&self) -> Store {
        Store::Ubisoft
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let Some(root) = open_key(HKLM, r"SOFTWARE\Ubisoft\Launcher\Installs") else { return Ok(vec![]) };

        // Los nombres bonitos están en las entradas "Uplay Install <id>".
        let names: HashMap<String, String> = uninstall_entries()
            .into_iter()
            .filter_map(|e| {
                e.key_name
                    .strip_prefix("Uplay Install ")
                    .map(|id| (id.to_string(), e.display_name))
            })
            .collect();

        let mut games = Vec::new();
        for (id, k) in subkeys(&root) {
            let Some(dir) = read_str(&k, "InstallDir") else { continue };
            let dir_path = Path::new(&dir);
            if !dir_path.exists() {
                continue;
            }
            let title = names.get(&id).cloned().or_else(|| {
                dir_path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
            });
            let Some(title) = title else { continue };
            games.push(DetectedGame {
                store: Store::Ubisoft,
                store_id: id.clone(),
                title,
                install_path: Some(dir.replace('/', "\\")),
                launch: LaunchTarget::Uri { uri: format!("uplay://launch/{id}/0") },
            });
        }
        Ok(games)
    }
}
