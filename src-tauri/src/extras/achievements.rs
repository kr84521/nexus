//! Logros de Steam. Requiere la clave de la Web API del usuario (ajuste `steamWebApiKey`) y que su
//! perfil tenga los detalles de juegos públicos. El SteamID se detecta de loginusers.vdf o se
//! configura a mano (`steamId`).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub icon_gray: String,
    pub hidden: bool,
    pub unlocked: bool,
    pub unlock_time: Option<i64>,
    /// % de jugadores que lo tienen (rareza)
    pub percent: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementsReport {
    pub total: usize,
    pub unlocked: usize,
    pub items: Vec<Achievement>,
}

#[derive(Deserialize)]
struct SchemaResp {
    game: Option<SchemaGame>,
}
#[derive(Deserialize)]
struct SchemaGame {
    #[serde(rename = "availableGameStats")]
    stats: Option<SchemaStats>,
}
#[derive(Deserialize)]
struct SchemaStats {
    #[serde(default)]
    achievements: Vec<SchemaAch>,
}
#[derive(Deserialize)]
struct SchemaAch {
    name: String,
    #[serde(rename = "displayName", default)]
    display_name: String,
    #[serde(default)]
    hidden: i64,
    #[serde(default)]
    description: String,
    #[serde(default)]
    icon: String,
    #[serde(default)]
    icongray: String,
}

#[derive(Deserialize)]
struct PlayerResp {
    playerstats: PlayerStats,
}
#[derive(Deserialize)]
struct PlayerStats {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    achievements: Vec<PlayerAch>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct PlayerAch {
    apiname: String,
    achieved: i64,
    #[serde(default)]
    unlocktime: i64,
}

#[derive(Deserialize)]
struct PercentResp {
    achievementpercentages: Option<Percentages>,
}
#[derive(Deserialize)]
struct Percentages {
    #[serde(default)]
    achievements: Vec<PercentAch>,
}
#[derive(Deserialize)]
struct PercentAch {
    name: String,
    percent: f64,
}

pub async fn fetch(http: &reqwest::Client, key: &str, steam_id: &str, appid: &str) -> AppResult<AchievementsReport> {
    let schema = http
        .get("https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/")
        .query(&[("key", key), ("appid", appid), ("l", "spanish")])
        .send()
        .await?;
    if schema.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(AppError::msg("La clave de la Web API de Steam no es válida"));
    }
    let schema: SchemaResp = schema.json().await?;
    let defs = schema.game.and_then(|g| g.stats).map(|s| s.achievements).unwrap_or_default();
    if defs.is_empty() {
        return Ok(AchievementsReport { total: 0, unlocked: 0, items: vec![] });
    }

    let player: PlayerResp = http
        .get("https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/")
        .query(&[("key", key), ("steamid", steam_id), ("appid", appid)])
        .send()
        .await?
        .json()
        .await?;
    if !player.playerstats.success {
        let why = player.playerstats.error.unwrap_or_default();
        return Err(AppError::msg(if why.contains("Profile is not public") {
            "Tu perfil de Steam no es público: cambia «Detalles del juego» a Público en la privacidad del perfil".to_string()
        } else {
            format!("Steam no devolvió los logros: {why}")
        }));
    }
    let state: HashMap<String, (bool, i64)> =
        player.playerstats.achievements.into_iter().map(|a| (a.apiname, (a.achieved == 1, a.unlocktime))).collect();

    // La rareza es opcional: si falla no bloquea el resto.
    let percents: HashMap<String, f64> = match http
        .get("https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/")
        .query(&[("gameid", appid)])
        .send()
        .await
    {
        Ok(r) => r
            .json::<PercentResp>()
            .await
            .ok()
            .and_then(|p| p.achievementpercentages)
            .map(|p| p.achievements.into_iter().map(|a| (a.name, a.percent)).collect())
            .unwrap_or_default(),
        Err(_) => HashMap::new(),
    };

    let mut items: Vec<Achievement> = defs
        .into_iter()
        .map(|d| {
            let (unlocked, t) = state.get(&d.name).copied().unwrap_or((false, 0));
            Achievement {
                percent: percents.get(&d.name).copied(),
                id: d.name,
                name: d.display_name,
                description: d.description,
                icon: d.icon,
                icon_gray: d.icongray,
                hidden: d.hidden == 1,
                unlocked,
                unlock_time: (unlocked && t > 0).then_some(t * 1000),
            }
        })
        .collect();
    // Desbloqueados primero (más recientes arriba), luego bloqueados por rareza descendente.
    items.sort_by(|a, b| {
        b.unlocked
            .cmp(&a.unlocked)
            .then(b.unlock_time.cmp(&a.unlock_time))
            .then(b.percent.partial_cmp(&a.percent).unwrap_or(std::cmp::Ordering::Equal))
    });
    let unlocked = items.iter().filter(|a| a.unlocked).count();
    Ok(AchievementsReport { total: items.len(), unlocked, items })
}
