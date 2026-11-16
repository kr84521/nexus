//! Sincronización con la cuenta de Steam (Web API con clave): juegos que posees y horas acumuladas.
//! Las horas de Steam se guardan en `games.external_playtime_secs`, separadas de las sesiones
//! medidas por Nexus, así la suma nunca se duplica y sincronizar es idempotente.

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[derive(Deserialize)]
struct Resp {
    response: Owned,
}
#[derive(Deserialize, Default)]
struct Owned {
    #[serde(default)]
    games: Vec<OwnedGame>,
}
#[derive(Deserialize)]
pub struct OwnedGame {
    pub appid: u64,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub playtime_forever: i64,
    #[serde(default)]
    pub rtime_last_played: i64,
    #[serde(default)]
    pub img_icon_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub owned: usize,
    pub updated: usize,
    pub hours: i64,
}

pub fn credentials(state: &AppState) -> AppResult<(String, String)> {
    let key = state
        .db
        .get_setting("steamWebApiKey")?
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| AppError::msg("Configura tu clave de la Web API de Steam en Ajustes"))?;
    let steam_id = state
        .db
        .get_setting("steamId")?
        .and_then(|v| v.as_str().map(str::to_string))
        .filter(|s| !s.trim().is_empty())
        .or_else(crate::extras::steam_user_id)
        .ok_or_else(|| AppError::msg("No se pudo detectar tu SteamID; escríbelo en Ajustes"))?;
    Ok((key.trim().to_string(), steam_id.trim().to_string()))
}

pub async fn fetch_owned(http: &reqwest::Client, key: &str, steam_id: &str) -> AppResult<Vec<OwnedGame>> {
    let res = http
        .get("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/")
        .query(&[
            ("key", key),
            ("steamid", steam_id),
            ("include_appinfo", "1"),
            ("include_played_free_games", "1"),
            ("format", "json"),
        ])
        .send()
        .await?;
    match res.status() {
        reqwest::StatusCode::FORBIDDEN => return Err(AppError::msg("La clave de la Web API de Steam no es válida")),
        reqwest::StatusCode::UNAUTHORIZED => return Err(AppError::msg("Steam rechazó la clave o el SteamID")),
        _ => {}
    }
    let body: Resp = res.json().await?;
    if body.response.games.is_empty() {
        return Err(AppError::msg(
            "Steam no devolvió juegos: comprueba el SteamID y que «Detalles del juego» sea público en tu perfil",
        ));
    }
    Ok(body.response.games)
}

/// Descarga la biblioteca de Steam, la guarda en `steam_owned` y aplica horas/última partida a los juegos instalados.
pub async fn sync(state: &AppState) -> AppResult<SyncReport> {
    let (key, steam_id) = credentials(state)?;
    let owned = fetch_owned(&state.http, &key, &steam_id).await?;
    state.db.replace_steam_owned(&owned)?;
    let (updated, secs) = state.db.apply_external_playtime(
        &owned
            .iter()
            .map(|g| (g.appid.to_string(), g.playtime_forever * 60, g.rtime_last_played * 1000))
            .collect::<Vec<_>>(),
    )?;
    Ok(SyncReport { owned: owned.len(), updated, hours: secs / 3600 })
}
