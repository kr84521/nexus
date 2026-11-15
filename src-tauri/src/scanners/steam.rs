use std::fs;
use std::path::{Path, PathBuf};

use super::util::{open_key, read_str, HKCU, HKLM};
use super::{vdf, StoreScanner};
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct Steam;

/// AppIDs de herramientas/runtimes que Steam instala pero no son juegos.
const IGNORED_APPIDS: &[&str] = &[
    "228980",  // Steamworks Common Redistributables
    "250820",  // SteamVR
    "1070560", // Steam Linux Runtime
    "1391110", // Steam Linux Runtime - Soldier
    "1628350", // Steam Linux Runtime - Sniper
    "1493710", // Proton Experimental
    "431960",  // Wallpaper Engine (aplicación)
];

const IGNORED_PREFIXES: &[&str] = &["Steamworks", "Proton ", "Steam Linux Runtime", "SteamVR"];

pub fn steam_root() -> Option<PathBuf> {
    open_key(HKCU, r"Software\Valve\Steam")
        .and_then(|k| read_str(&k, "SteamPath"))
        .or_else(|| open_key(HKLM, r"SOFTWARE\Valve\Steam").and_then(|k| read_str(&k, "InstallPath")))
        .map(PathBuf::from)
        .filter(|p| p.exists())
}

impl StoreScanner for Steam {
    fn store(&self) -> Store {
        Store::Steam
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let Some(root) = steam_root() else { return Ok(vec![]) };

        let mut libraries = vec![root.clone()];
        let lf_path = root.join("steamapps").join("libraryfolders.vdf");
        if let Ok(text) = fs::read_to_string(&lf_path) {
            let doc = vdf::parse(&text);
            if let Some(lf) = doc.get("libraryfolders") {
                for (_, entry) in lf.entries() {
                    // Formato nuevo: { "path" "..." }. Formato antiguo: "1" "D:\\SteamLibrary".
                    let path = match entry {
                        vdf::Vdf::Obj(_) => entry.str("path").map(str::to_string),
                        vdf::Vdf::Str(s) if Path::new(s).is_absolute() => Some(s.clone()),
                        _ => None,
                    };
                    if let Some(p) = path.map(PathBuf::from) {
                        if !libraries.iter().any(|l| same_path(l, &p)) {
                            libraries.push(p);
                        }
                    }
                }
            }
        }

        let mut games = Vec::new();
        for lib in libraries {
            let apps = lib.join("steamapps");
            let Ok(dir) = fs::read_dir(&apps) else { continue };
            for entry in dir.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !(name.starts_with("appmanifest_") && name.ends_with(".acf")) {
                    continue;
                }
                let Ok(text) = fs::read_to_string(entry.path()) else { continue };
                let doc = vdf::parse(&text);
                let Some(state) = doc.get("AppState") else { continue };
                let (Some(appid), Some(title)) = (state.str("appid"), state.str("name")) else {
                    continue;
                };
                if IGNORED_APPIDS.contains(&appid) || IGNORED_PREFIXES.iter().any(|p| title.starts_with(p)) {
                    continue;
                }
                let install_path = state
                    .str("installdir")
                    .map(|d| apps.join("common").join(d).to_string_lossy().into_owned());
                games.push(DetectedGame {
                    store: Store::Steam,
                    store_id: appid.to_string(),
                    title: title.to_string(),
                    install_path,
                    launch: LaunchTarget::Uri { uri: format!("steam://rungameid/{appid}") },
                });
            }
        }
        Ok(games)
    }
}

fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase();
    norm(a) == norm(b)
}
