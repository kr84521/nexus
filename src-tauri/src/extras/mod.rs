//! Extras de la ficha: capturas de pantalla, novedades y logros (fuentes de Steam, sin iniciar sesión).

pub mod achievements;
pub mod news;
pub mod screenshots;

use std::fs;

use crate::models::{Game, Store};
use crate::scanners::{steam_root, vdf};

/// AppID de Steam del juego: de su fuente Steam o de los metadatos (juegos de otras tiendas que existen en Steam).
pub fn steam_appid(game: &Game) -> Option<String> {
    game.sources
        .iter()
        .find(|s| s.store == Store::Steam)
        .map(|s| s.store_id.clone())
        .or_else(|| game.meta.as_ref().and_then(|m| m.steam_appid.clone()))
}

/// SteamID64 del usuario más reciente de Steam (config/loginusers.vdf).
pub fn steam_user_id() -> Option<String> {
    let text = fs::read_to_string(steam_root()?.join("config").join("loginusers.vdf")).ok()?;
    let doc = vdf::parse(&text);
    let users = doc.get("users")?;
    let mut first = None;
    for (id, u) in users.entries() {
        if first.is_none() {
            first = Some(id.clone());
        }
        if u.str("MostRecent") == Some("1") {
            return Some(id.clone());
        }
    }
    first
}
