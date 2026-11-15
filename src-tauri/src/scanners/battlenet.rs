//! Battle.net. Los juegos se detectan por sus entradas de desinstalación (Blizzard Uninstaller con `--uid=`)
//! y se lanzan con `Battle.net.exe --exec="launch <CÓDIGO>"`.

use std::path::{Path, PathBuf};

use super::util::{cli_arg, clean_exe_path, open_key, read_str, uninstall_entries, HKLM};
use super::StoreScanner;
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct BattleNet;

/// uid de desinstalación → código de lanzamiento de Battle.net.
const PRODUCTS: &[(&str, &str)] = &[
    ("prometheus", "Pro"),   // Overwatch 2
    ("fenris", "Fen"),       // Diablo IV
    ("diablo3", "D3"),       // Diablo III
    ("osi", "OSI"),          // Diablo II: Resurrected
    ("anbs", "ANBS"),        // Diablo Immortal
    ("wow", "WoW"),          // World of Warcraft
    ("wow_classic", "WoWC"), // WoW Classic
    ("s2", "S2"),            // StarCraft II
    ("s1", "S1"),            // StarCraft Remastered
    ("heroes", "Hero"),      // Heroes of the Storm
    ("hs_beta", "WTCG"),     // Hearthstone
    ("w3", "W3"),            // Warcraft III: Reforged
    ("viper", "VIPR"),       // CoD Black Ops 4
    ("odin", "ODIN"),        // CoD Modern Warfare
    ("lazarus", "LAZR"),     // CoD MW2 Campaign Remastered
    ("zeus", "ZEUS"),        // CoD Black Ops Cold War
    ("fore", "FORE"),        // CoD Vanguard
    ("auks", "AUKS"),        // Call of Duty (HQ)
    ("rtro", "RTRO"),        // Blizzard Arcade Collection
    ("wlby", "WLBY"),        // Crash Bandicoot 4
    ("gryphon", "GRY"),      // Warcraft Rumble
];

fn battlenet_exe() -> Option<PathBuf> {
    let from_reg = open_key(HKLM, r"SOFTWARE\Blizzard Entertainment\Battle.net\Capabilities")
        .and_then(|k| read_str(&k, "ApplicationIcon"))
        .and_then(|s| clean_exe_path(&s))
        .map(PathBuf::from);
    from_reg.or_else(|| {
        let p = PathBuf::from(r"C:\Program Files (x86)\Battle.net\Battle.net.exe");
        p.is_file().then_some(p)
    })
}

impl StoreScanner for BattleNet {
    fn store(&self) -> Store {
        Store::Battlenet
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let launcher = battlenet_exe();
        let mut games = Vec::new();

        for e in uninstall_entries() {
            let Some(cmd) = e.uninstall_string.as_deref() else { continue };
            if !cmd.contains("Blizzard Uninstaller") {
                continue;
            }
            let Some(uid) = cli_arg(cmd, "uid") else { continue };
            if uid.eq_ignore_ascii_case("battle.net") {
                continue;
            }
            let code = PRODUCTS
                .iter()
                .find(|(u, _)| uid.eq_ignore_ascii_case(u))
                .map(|(_, c)| *c);

            let launch = match (code, &launcher) {
                (Some(code), Some(exe)) => LaunchTarget::Exe {
                    path: exe.to_string_lossy().into_owned(),
                    args: vec![format!("--exec=launch {code}")],
                    cwd: exe.parent().map(|p| p.to_string_lossy().into_owned()),
                },
                (Some(code), None) => LaunchTarget::Uri { uri: format!("battlenet://{code}") },
                // uid desconocido: se lanza el ejecutable del juego directamente.
                (None, _) => match e.display_icon.as_deref().and_then(clean_exe_path) {
                    Some(exe) => LaunchTarget::Exe {
                        cwd: Path::new(&exe).parent().map(|p| p.to_string_lossy().into_owned()),
                        path: exe,
                        args: vec![],
                    },
                    None => continue,
                },
            };

            games.push(DetectedGame {
                store: Store::Battlenet,
                store_id: uid,
                title: e.display_name,
                install_path: e.install_location,
                launch,
            });
        }
        Ok(games)
    }
}
