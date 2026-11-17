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

/// Cuenta de Steam que ha iniciado sesión en este PC (config/loginusers.vdf).
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SteamAccount {
    pub steam_id: String,
    pub account_name: String,
    pub persona_name: String,
    /// Último inicio de sesión (segundos Unix)
    pub timestamp: i64,
    pub most_recent: bool,
}

pub fn parse_login_users(text: &str) -> Vec<SteamAccount> {
    let doc = vdf::parse(text);
    let Some(users) = doc.get("users") else { return vec![] };
    let mut out: Vec<SteamAccount> = users
        .entries()
        .filter(|(id, _)| id.len() == 17 && id.chars().all(|c| c.is_ascii_digit()))
        .map(|(id, u)| SteamAccount {
            steam_id: id.clone(),
            account_name: u.str("AccountName").unwrap_or_default().to_string(),
            persona_name: u.str("PersonaName").unwrap_or_default().to_string(),
            timestamp: u.str("Timestamp").and_then(|t| t.parse().ok()).unwrap_or(0),
            most_recent: u.str("MostRecent") == Some("1"),
        })
        .collect();
    // Más reciente primero: la marca MostRecent (si Steam la escribe) y si no, el último inicio de sesión.
    out.sort_by(|a, b| b.most_recent.cmp(&a.most_recent).then(b.timestamp.cmp(&a.timestamp)));
    out
}

pub fn steam_accounts() -> Vec<SteamAccount> {
    steam_root()
        .and_then(|root| fs::read_to_string(root.join("config").join("loginusers.vdf")).ok())
        .map(|t| parse_login_users(&t))
        .unwrap_or_default()
}

/// SteamID64 de la cuenta usada más recientemente en este PC.
pub fn steam_user_id() -> Option<String> {
    steam_accounts().into_iter().next().map(|a| a.steam_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_most_recent_account_by_timestamp() {
        // Caso real: dos cuentas, ninguna con MostRecent. El orden numérico de los IDs no sirve.
        let text = r#"
"users"
{
	"76561199042645892" { "AccountName" "kr84521" "PersonaName" "kr" "timestamp" "1794838949" }
	"76561198831066802" { "AccountName" "otra" "PersonaName" "otro" "timestamp" "1793116654" }
}"#;
        let accs = parse_login_users(text);
        assert_eq!(accs[0].steam_id, "76561199042645892");
        assert_eq!(accs[0].account_name, "kr84521");
        assert_eq!(accs.len(), 2);

        let with_flag = text.replace(r#""otra" "PersonaName" "otro""#, r#""otra" "PersonaName" "otro" "MostRecent" "1""#);
        assert_eq!(parse_login_users(&with_flag)[0].account_name, "otra");
    }
}
