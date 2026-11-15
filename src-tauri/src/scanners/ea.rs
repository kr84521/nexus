//! EA App / Origin. Sus juegos se identifican por la carpeta `__Installer` dentro de la instalación
//! y aparecen en las entradas de desinstalación de Windows. Lanzar el .exe hace que EA App
//! se encargue de la autenticación.

use std::path::Path;

use super::util::{clean_exe_path, uninstall_entries};
use super::StoreScanner;
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct Ea;

impl StoreScanner for Ea {
    fn store(&self) -> Store {
        Store::Ea
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let mut games = Vec::new();
        for e in uninstall_entries() {
            let Some(loc) = e.install_location.as_deref() else { continue };
            let loc_path = Path::new(loc.trim_matches('"'));
            if !loc_path.join("__Installer").join("installerdata.xml").is_file() {
                continue;
            }
            // Las versiones de Steam de juegos de EA también traen __Installer: las deja a Steam.
            if loc.to_lowercase().contains(r"steamapps\common") {
                continue;
            }
            let Some(exe) = e.display_icon.as_deref().and_then(clean_exe_path) else { continue };
            if exe.to_lowercase().contains("uninstall") || exe.to_lowercase().contains("cleanup") {
                continue;
            }
            games.push(DetectedGame {
                store: Store::Ea,
                store_id: e.key_name,
                title: e.display_name,
                install_path: Some(loc_path.to_string_lossy().into_owned()),
                launch: LaunchTarget::Exe {
                    cwd: Path::new(&exe).parent().map(|p| p.to_string_lossy().into_owned()),
                    path: exe,
                    args: vec![],
                },
            });
        }
        Ok(games)
    }
}
