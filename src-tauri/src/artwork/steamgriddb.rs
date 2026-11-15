//! Cliente mínimo de la API v2 de SteamGridDB. https://www.steamgriddb.com/api/v2

use serde::Deserialize;

use crate::error::{AppError, AppResult};
use crate::models::{ArtKind, ArtOption, SgdbGame};

const BASE: &str = "https://www.steamgriddb.com/api/v2";

#[derive(Deserialize)]
struct Resp<T> {
    success: bool,
    data: Option<T>,
    #[serde(default)]
    errors: Vec<String>,
}

#[derive(Deserialize)]
struct RawGame {
    id: i64,
    name: String,
    release_date: Option<i64>,
}

#[derive(Deserialize)]
struct RawAsset {
    id: i64,
    url: String,
    thumb: String,
    #[serde(default)]
    width: i64,
    #[serde(default)]
    height: i64,
    style: Option<String>,
    author: Option<RawAuthor>,
}

#[derive(Deserialize)]
struct RawAuthor {
    name: Option<String>,
}

pub struct Sgdb<'a> {
    pub http: &'a reqwest::Client,
    pub key: &'a str,
}

impl Sgdb<'_> {
    async fn get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> AppResult<Option<T>> {
        let res = self.http.get(format!("{BASE}{path}")).bearer_auth(self.key).send().await?;
        let status = res.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AppError::msg("La API key de SteamGridDB no es válida"));
        }
        let body: Resp<T> = res.json().await?;
        if !body.success {
            return Err(AppError::msg(format!("SteamGridDB: {}", body.errors.join(", "))));
        }
        Ok(body.data)
    }

    pub async fn search(&self, term: &str) -> AppResult<Vec<SgdbGame>> {
        let term = encode_path(term);
        let games: Vec<RawGame> = self.get(&format!("/search/autocomplete/{term}")).await?.unwrap_or_default();
        Ok(games
            .into_iter()
            .map(|g| SgdbGame { id: g.id, name: g.name, release_date: g.release_date })
            .collect())
    }

    pub async fn by_steam_appid(&self, appid: &str) -> AppResult<Option<SgdbGame>> {
        let g: Option<RawGame> = self.get(&format!("/games/steam/{appid}")).await?;
        Ok(g.map(|g| SgdbGame { id: g.id, name: g.name, release_date: g.release_date }))
    }

    pub async fn assets(&self, game_id: i64, kind: ArtKind) -> AppResult<Vec<ArtOption>> {
        let path = match kind {
            ArtKind::Cover => format!("/grids/game/{game_id}?dimensions=600x900,342x482,660x930&nsfw=false&humor=false"),
            ArtKind::Hero => format!("/heroes/game/{game_id}?nsfw=false&humor=false"),
            ArtKind::Logo => format!("/logos/game/{game_id}?nsfw=false&humor=false"),
            ArtKind::Icon => format!("/icons/game/{game_id}?nsfw=false&humor=false"),
        };
        let raw: Vec<RawAsset> = self.get(&path).await?.unwrap_or_default();
        Ok(raw
            .into_iter()
            .map(|a| ArtOption {
                id: a.id,
                url: a.url,
                thumb: a.thumb,
                width: a.width,
                height: a.height,
                style: a.style,
                author: a.author.and_then(|x| x.name),
            })
            .collect())
    }
}

/// Codifica un segmento de ruta (percent-encoding de todo lo que no sea alfanumérico ASCII).
fn encode_path(s: &str) -> String {
    let mut out = String::new();
    for b in s.trim().bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Arte del CDN público de Steam (fallback sin API key, solo juegos de Steam).
pub fn steam_cdn_url(appid: &str, kind: ArtKind) -> String {
    let file = match kind {
        ArtKind::Cover => "library_600x900_2x.jpg",
        ArtKind::Hero => "library_hero.jpg",
        ArtKind::Logo => "logo.png",
        ArtKind::Icon => "capsule_231x87.jpg",
    };
    format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/{file}")
}
