//! Manifiesto de Ludusavi: qué rutas usa cada juego para guardar partidas.
//! https://github.com/mtkennerly/ludusavi-manifest (misma fuente que PCGamingWiki).

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::library::normalize_title;
use crate::state::AppState;

const URL: &str = "https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml";
const MAX_AGE: Duration = Duration::from_secs(7 * 24 * 3600);

#[derive(Deserialize, Default)]
struct RawGame {
    #[serde(default)]
    files: HashMap<String, RawFile>,
    #[serde(default)]
    steam: RawSteam,
}

#[derive(Deserialize, Default)]
struct RawFile {
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    when: Vec<RawWhen>,
}

#[derive(Deserialize, Default)]
struct RawWhen {
    os: Option<String>,
}

#[derive(Deserialize, Default)]
struct RawSteam {
    id: Option<u64>,
}

/// Entrada reducida: solo patrones de guardado válidos en Windows.
pub struct Entry {
    pub patterns: Vec<String>,
}

pub struct SaveManifest {
    by_title: HashMap<String, usize>,
    by_steam: HashMap<String, usize>,
    entries: Vec<Entry>,
}

static CACHE: Mutex<Option<std::sync::Arc<SaveManifest>>> = Mutex::new(None);

fn cache_file(state: &AppState) -> PathBuf {
    state.art_dir.parent().unwrap_or(&state.art_dir).join("ludusavi-manifest.yaml")
}

/// Descarga (si hace falta) y parsea el manifiesto. Se cachea en memoria tras la primera llamada.
pub fn get(state: &AppState) -> AppResult<std::sync::Arc<SaveManifest>> {
    if let Some(m) = CACHE.lock().unwrap_or_else(|e| e.into_inner()).clone() {
        return Ok(m);
    }
    let file = cache_file(state);
    let stale = fs::metadata(&file)
        .and_then(|m| m.modified())
        .map(|t| t.elapsed().map(|e| e > MAX_AGE).unwrap_or(true))
        .unwrap_or(true);
    if stale {
        if let Err(e) = download(&file) {
            if !file.exists() {
                return Err(AppError::msg(format!("No se pudo descargar la base de rutas de guardado: {e}")));
            }
        }
    }
    let text = fs::read_to_string(&file)?;
    let m = std::sync::Arc::new(parse(&text)?);
    *CACHE.lock().unwrap_or_else(|e| e.into_inner()) = Some(m.clone());
    Ok(m)
}

fn download(dest: &Path) -> AppResult<()> {
    let body = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("NexusLauncher")
        .build()?
        .get(URL)
        .send()?
        .error_for_status()?
        .bytes()?;
    if let Some(p) = dest.parent() {
        fs::create_dir_all(p)?;
    }
    fs::write(dest, &body)?;
    Ok(())
}

pub fn parse(yaml: &str) -> AppResult<SaveManifest> {
    let raw: HashMap<String, RawGame> =
        serde_yaml::from_str(yaml).map_err(|e| AppError::msg(format!("Manifiesto ilegible: {e}")))?;
    let mut m = SaveManifest { by_title: HashMap::new(), by_steam: HashMap::new(), entries: Vec::new() };
    for (title, g) in raw {
        let patterns: Vec<String> = g
            .files
            .into_iter()
            .filter(|(p, f)| {
                let windows_ok = f.when.is_empty() || f.when.iter().any(|w| w.os.as_deref().map_or(true, |o| o == "windows"));
                let save_ok = f.tags.is_empty() || f.tags.iter().any(|t| t == "save");
                windows_ok && save_ok && !p.contains("<reg") && !p.contains("<xdg")
            })
            .map(|(p, _)| p)
            .collect();
        if patterns.is_empty() {
            continue;
        }
        let idx = m.entries.len();
        m.entries.push(Entry { patterns });
        m.by_title.insert(normalize_title(&title), idx);
        if let Some(id) = g.steam.id {
            m.by_steam.insert(id.to_string(), idx);
        }
    }
    Ok(m)
}

impl SaveManifest {
    pub fn lookup(&self, title: &str, steam_id: Option<&str>) -> Option<&Entry> {
        steam_id
            .and_then(|id| self.by_steam.get(id))
            .or_else(|| self.by_title.get(&normalize_title(title)))
            .map(|&i| &self.entries[i])
    }

    /// Sustituye los marcadores de Ludusavi por rutas de este PC y expande comodines.
    /// Devuelve solo las rutas que existen.
    pub fn resolve_paths(&self, title: &str, steam_id: Option<&str>, install_dir: Option<&str>) -> Vec<String> {
        let Some(entry) = self.lookup(title, steam_id) else { return vec![] };
        let env = |k: &str| std::env::var(k).ok();
        let home = env("USERPROFILE").unwrap_or_default();
        let subs: Vec<(&str, String)> = vec![
            ("<home>", home.clone()),
            ("<winAppData>", env("APPDATA").unwrap_or_default()),
            ("<winLocalAppData>", env("LOCALAPPDATA").unwrap_or_default()),
            ("<winLocalAppDataLow>", format!("{home}\\AppData\\LocalLow")),
            ("<winDocuments>", format!("{home}\\Documents")),
            ("<winPublic>", env("PUBLIC").unwrap_or_else(|| "C:\\Users\\Public".into())),
            ("<winProgramData>", env("ProgramData").unwrap_or_else(|| "C:\\ProgramData".into())),
            ("<winDir>", env("WINDIR").unwrap_or_else(|| "C:\\Windows".into())),
            ("<storeUserId>", "*".into()),
            ("<osUserName>", "*".into()),
            ("<storeGameId>", steam_id.unwrap_or("*").to_string()),
        ];
        let mut out = Vec::new();
        for pat in &entry.patterns {
            let mut p = pat.clone();
            // <base> y <root>/<game> son la carpeta de instalación.
            match install_dir {
                Some(dir) => {
                    p = p.replace("<base>", dir).replace("<root>/<game>", dir);
                    if p.contains("<root>") || p.contains("<game>") {
                        continue;
                    }
                }
                None => {
                    if p.contains("<base>") || p.contains("<root>") || p.contains("<game>") {
                        continue;
                    }
                }
            }
            for (k, v) in &subs {
                p = p.replace(k, v);
            }
            if p.contains('<') {
                continue; // marcador desconocido
            }
            let p = p.replace('/', "\\");
            let opts = glob::MatchOptions { case_sensitive: false, require_literal_separator: false, require_literal_leading_dot: false };
            if let Ok(paths) = glob::glob_with(&p, opts) {
                for found in paths.flatten() {
                    let s = found.to_string_lossy().into_owned();
                    if !out.contains(&s) {
                        out.push(s);
                    }
                }
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_manifest_subset() {
        let yaml = r#"
Celeste:
  files:
    <winLocalAppData>/Celeste/Saves:
      tags: [save]
      when:
        - os: windows
    <base>/settings.xml:
      tags: [config]
  steam:
    id: 504230
Only Linux:
  files:
    <xdgData>/x:
      when:
        - os: linux
"#;
        let m = parse(yaml).unwrap();
        let e = m.lookup("celeste", None).unwrap();
        assert_eq!(e.patterns, vec!["<winLocalAppData>/Celeste/Saves"]);
        assert!(m.lookup("x", Some("504230")).is_some());
        assert!(m.lookup("Only Linux", None).is_none());
    }
}

/// `NEXUS_MANIFEST=<ruta al manifest.yaml real> cargo test real_manifest -- --ignored --nocapture`
#[cfg(test)]
mod real_tests {
    use super::*;

    #[test]
    #[ignore]
    fn parses_real_manifest() {
        let Ok(path) = std::env::var("NEXUS_MANIFEST") else { return };
        let text = std::fs::read_to_string(path).unwrap();
        let t = std::time::Instant::now();
        let m = parse(&text).unwrap();
        println!("entradas: {} · por steam id: {} · {:?}", m.entries.len(), m.by_steam.len(), t.elapsed());
        for (title, id) in [("Celeste", "504230"), ("Hades", "1145360"), ("Barony", "371970"), ("Geometry Dash", "322170")] {
            let e = m.lookup(title, Some(id)).unwrap_or_else(|| panic!("falta {title}"));
            println!("{title}: {:?}", e.patterns);
        }
        let paths = m.resolve_paths("Geometry Dash", Some("322170"), None);
        println!("Geometry Dash en este PC: {paths:?}");
        assert!(m.entries.len() > 10_000);
    }
}
