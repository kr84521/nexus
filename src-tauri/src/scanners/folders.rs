//! Carpetas elegidas por el usuario (ajuste `scanFolders`): cada subcarpeta directa que contenga
//! un .exe se considera un juego. Pensado para juegos sin tienda, emuladores, GOG offline, etc.

use std::fs;
use std::path::{Path, PathBuf};

use super::StoreScanner;
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct Folders {
    pub roots: Vec<String>,
}

/// Ejecutables que casi nunca son el juego.
const SKIP_WORDS: &[&str] = &[
    "unins", "uninstall", "setup", "install", "redist", "vcredist", "dxsetup", "crash", "report",
    "handler", "launcher_helper", "updater", "update", "patch", "config", "settings", "benchmark",
    "editor", "server", "dedicated", "tool", "helper", "unitycrash", "ue4prereq", "ueprereq",
    "dotnet", "directx", "easyanticheat", "eac", "battleye", "beservice", "cleanup", "repair",
];

/// Carpetas intermedias donde suele vivir el ejecutable real.
const BIN_DIRS: &[&str] = &["bin", "binaries", "win64", "win32", "x64", "x86", "game", "bin64", "retail", "shipping"];

fn is_skipped(name: &str) -> bool {
    let n = name.to_lowercase();
    SKIP_WORDS.iter().any(|w| n.contains(w))
}

fn exes_in(dir: &Path) -> Vec<PathBuf> {
    let Ok(rd) = fs::read_dir(dir) else { return vec![] };
    let mut v: Vec<PathBuf> = rd
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_file() && p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")))
        .collect();
    v.sort();
    v
}

/// Busca el ejecutable principal de una carpeta de juego: primero en la raíz, luego en subcarpetas
/// típicas (bin, Binaries/Win64...), hasta 3 niveles. Devuelve el candidato más grande.
pub fn find_main_exe(game_dir: &Path) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut queue = vec![(game_dir.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = queue.pop() {
        candidates.extend(exes_in(&dir).into_iter().filter(|p| {
            !is_skipped(&p.file_name().unwrap_or_default().to_string_lossy())
        }));
        if depth >= 3 {
            continue;
        }
        let Ok(rd) = fs::read_dir(&dir) else { continue };
        for e in rd.flatten() {
            let p = e.path();
            if !p.is_dir() {
                continue;
            }
            let name = p.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            if BIN_DIRS.contains(&name.as_str()) || depth == 0 && candidates.is_empty() {
                queue.push((p, depth + 1));
            }
        }
    }
    // Entre varios candidatos, el más grande suele ser el juego (los pequeños son lanzadores/utilidades).
    candidates
        .into_iter()
        .max_by_key(|p| fs::metadata(p).map(|m| m.len()).unwrap_or(0))
}

/// "The_Witcher-3.v1.2" → "The Witcher 3"
pub fn pretty_name(folder: &str) -> String {
    let base = folder.split(['[', '(']).next().unwrap_or(folder);
    let mut s = base.replace(['_', '.'], " ");
    // Quita sufijos de versión tipo "v1 2 3"
    if let Some(i) = s.to_lowercase().find(" v") {
        if s[i + 2..].chars().next().is_some_and(|c| c.is_ascii_digit()) {
            s.truncate(i);
        }
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

impl StoreScanner for Folders {
    fn store(&self) -> Store {
        Store::Manual
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let mut games = Vec::new();
        for root in &self.roots {
            let root_path = Path::new(root);
            let Ok(rd) = fs::read_dir(root_path) else { continue };
            for e in rd.flatten() {
                let dir = e.path();
                if !dir.is_dir() {
                    continue;
                }
                let Some(exe) = find_main_exe(&dir) else { continue };
                let folder = dir.file_name().unwrap_or_default().to_string_lossy().into_owned();
                games.push(DetectedGame {
                    store: Store::Manual,
                    store_id: format!("dir:{}", dir.to_string_lossy().to_lowercase()),
                    title: pretty_name(&folder),
                    install_path: Some(dir.to_string_lossy().into_owned()),
                    launch: LaunchTarget::Exe {
                        cwd: exe.parent().map(|p| p.to_string_lossy().into_owned()),
                        path: exe.to_string_lossy().into_owned(),
                        args: vec![],
                    },
                });
            }
        }
        Ok(games)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prettifies_folder_names() {
        assert_eq!(pretty_name("The_Witcher.3"), "The Witcher 3");
        assert_eq!(pretty_name("Hades v1.38 [FitGirl]"), "Hades");
        assert_eq!(pretty_name("Celeste (GOG)"), "Celeste");
    }

    #[test]
    fn skips_utility_exes() {
        assert!(is_skipped("unins000.exe"));
        assert!(is_skipped("UnityCrashHandler64.exe"));
        assert!(!is_skipped("Hades.exe"));
    }
}
