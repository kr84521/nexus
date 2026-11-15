use std::path::Path;

use super::util::{open_key, read_str, subkeys, HKLM};
use super::StoreScanner;
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct Gog;

impl StoreScanner for Gog {
    fn store(&self) -> Store {
        Store::Gog
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let Some(root) = open_key(HKLM, r"SOFTWARE\GOG.com\Games") else { return Ok(vec![]) };

        let galaxy = open_key(HKLM, r"SOFTWARE\GOG.com\GalaxyClient\paths")
            .and_then(|k| read_str(&k, "client"))
            .map(|dir| Path::new(&dir).join("GalaxyClient.exe"))
            .filter(|p| p.is_file());

        let mut games = Vec::new();
        for (key_name, k) in subkeys(&root) {
            let Some(title) = read_str(&k, "gameName") else { continue };
            // Los DLC dependen de otro juego.
            if read_str(&k, "dependsOn").is_some() {
                continue;
            }
            let game_id = read_str(&k, "gameID").unwrap_or(key_name);
            let path = read_str(&k, "path");

            let launch = if let Some(galaxy) = &galaxy {
                let mut args = vec!["/command=runGame".to_string(), format!("/gameId={game_id}")];
                if let Some(p) = &path {
                    args.push(format!("/path={p}"));
                }
                LaunchTarget::Exe {
                    path: galaxy.to_string_lossy().into_owned(),
                    args,
                    cwd: galaxy.parent().map(|p| p.to_string_lossy().into_owned()),
                }
            } else if let Some(exe) = read_str(&k, "exe").filter(|e| Path::new(e).is_file()) {
                let args = read_str(&k, "launchParam")
                    .map(|p| p.split_whitespace().map(str::to_string).collect())
                    .unwrap_or_default();
                LaunchTarget::Exe { path: exe, args, cwd: read_str(&k, "workingDir").or(path.clone()) }
            } else {
                continue;
            };

            games.push(DetectedGame {
                store: Store::Gog,
                store_id: game_id,
                title,
                install_path: path,
                launch,
            });
        }
        Ok(games)
    }
}
