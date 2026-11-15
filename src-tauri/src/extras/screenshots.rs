//! Capturas: carpeta de capturas de Steam (userdata/<uid>/760/remote/<appid>/screenshots) y las de
//! Xbox Game Bar (Vídeos/Capturas, con el nombre del juego en el archivo).

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::library::normalize_title;
use crate::models::Game;
use crate::scanners::steam_root;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub path: String,
    pub modified: i64,
    pub source: &'static str,
}

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp"];

fn images_in(dir: &Path, source: &'static str, out: &mut Vec<Screenshot>, filter: &dyn Fn(&str) -> bool) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let is_img = p.extension().and_then(|x| x.to_str()).is_some_and(|x| IMAGE_EXTS.iter().any(|i| i.eq_ignore_ascii_case(x)));
        if !is_img || !filter(&p.file_name().unwrap_or_default().to_string_lossy()) {
            continue;
        }
        let modified = e
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        out.push(Screenshot { path: p.to_string_lossy().into_owned(), modified, source });
    }
}

pub fn find(game: &Game, steam_appid: Option<&str>) -> Vec<Screenshot> {
    let mut out = Vec::new();

    if let (Some(root), Some(appid)) = (steam_root(), steam_appid) {
        let userdata = root.join("userdata");
        if let Ok(users) = fs::read_dir(&userdata) {
            for u in users.flatten() {
                let dir: PathBuf = u.path().join("760").join("remote").join(appid).join("screenshots");
                images_in(&dir, "Steam", &mut out, &|_| true);
            }
        }
    }

    // Xbox Game Bar: "<Título del juego> 2024-05-01 20-11-03.png"
    if let Ok(home) = std::env::var("USERPROFILE") {
        let title = normalize_title(game.custom_title.as_deref().unwrap_or(&game.title));
        if !title.is_empty() {
            for sub in ["Videos\\Captures", "Vídeos\\Capturas", "Videos\\Capturas"] {
                images_in(&Path::new(&home).join(sub), "Game Bar", &mut out, &|name| {
                    // Quita la fecha final y compara el título normalizado.
                    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
                    let base: String = stem.chars().take_while(|c| !c.is_ascii_digit()).collect();
                    normalize_title(&base) == title
                });
            }
        }
    }

    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out.dedup_by(|a, b| a.path.eq_ignore_ascii_case(&b.path));
    out
}
