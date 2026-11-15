//! Emuladores y ROMs (ajuste `emulators`): cada archivo con una extensión configurada dentro de la
//! carpeta de ROMs del emulador es un juego que se lanza con `<emulador> <args con {rom}>`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::folders::pretty_name;
use super::StoreScanner;
use crate::launcher::split_args;
use crate::models::{DetectedGame, LaunchTarget, Store};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmulatorConfig {
    pub id: String,
    pub name: String,
    pub exe_path: String,
    /// Argumentos; `{rom}` se sustituye por la ruta de la ROM. Por defecto `"{rom}"`.
    #[serde(default)]
    pub args: String,
    pub roms_dir: String,
    /// Extensiones sin punto, en minúsculas.
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub platform: String,
}

pub struct Roms {
    pub emulators: Vec<EmulatorConfig>,
}

const MAX_DEPTH: usize = 3;

fn walk(dir: &Path, depth: usize, exts: &[String], out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            if depth < MAX_DEPTH {
                walk(&p, depth + 1, exts, out);
            }
        } else if let Some(ext) = p.extension().and_then(|x| x.to_str()) {
            if exts.iter().any(|x| x.eq_ignore_ascii_case(ext)) {
                out.push(p);
            }
        }
    }
}

/// Construye los argumentos finales del emulador para una ROM.
pub fn build_args(template: &str, rom: &str) -> Vec<String> {
    let t = if template.trim().is_empty() { "\"{rom}\"" } else { template };
    split_args(t)
        .into_iter()
        .map(|a| a.replace("{rom}", rom))
        .collect()
}

impl StoreScanner for Roms {
    fn store(&self) -> Store {
        Store::Rom
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let mut games = Vec::new();
        for emu in &self.emulators {
            let exe = Path::new(&emu.exe_path);
            if !exe.is_file() || emu.extensions.is_empty() {
                continue;
            }
            let mut roms = Vec::new();
            walk(Path::new(&emu.roms_dir), 0, &emu.extensions, &mut roms);
            roms.sort();
            // Varias extensiones para la misma ROM (p. ej. .cue + .bin): una por nombre base.
            let mut seen = std::collections::HashSet::new();
            for rom in roms {
                let stem = rom.file_stem().unwrap_or_default().to_string_lossy().into_owned();
                if !seen.insert((rom.parent().map(|p| p.to_path_buf()), stem.to_lowercase())) {
                    continue;
                }
                let rom_s = rom.to_string_lossy().into_owned();
                games.push(DetectedGame {
                    store: Store::Rom,
                    store_id: format!("{}:{}", emu.id, rom_s.to_lowercase()),
                    title: pretty_name(&stem),
                    // La carpeta del emulador: así el seguimiento de tiempo detecta su proceso.
                    install_path: exe.parent().map(|p| p.to_string_lossy().into_owned()),
                    launch: LaunchTarget::Exe {
                        path: emu.exe_path.clone(),
                        args: build_args(&emu.args, &rom_s),
                        cwd: exe.parent().map(|p| p.to_string_lossy().into_owned()),
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
    fn builds_args() {
        assert_eq!(build_args("", r"D:\roms\a b.iso"), vec![r"D:\roms\a b.iso"]);
        assert_eq!(build_args(r#"-L cores\snes.dll "{rom}""#, "x.sfc"), vec!["-L", r"cores\snes.dll", "x.sfc"]);
    }
}
