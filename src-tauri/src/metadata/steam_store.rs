//! Cliente mínimo de la Store de Steam (endpoints públicos sin clave).

use std::collections::HashMap;

use serde::Deserialize;

use crate::error::AppResult;
use crate::models::Metadata;

pub struct SteamStore<'a> {
    pub http: &'a reqwest::Client,
}

#[derive(Deserialize)]
pub struct SearchItem {
    pub id: i64,
    pub name: String,
}

#[derive(Deserialize)]
struct SearchResp {
    #[serde(default)]
    items: Vec<SearchItem>,
}

#[derive(Deserialize)]
struct DetailsEntry {
    success: bool,
    data: Option<Details>,
}

#[derive(Deserialize)]
struct Details {
    short_description: Option<String>,
    #[serde(default)]
    genres: Vec<Named>,
    #[serde(default)]
    developers: Vec<String>,
    #[serde(default)]
    publishers: Vec<String>,
    release_date: Option<ReleaseDate>,
    #[serde(default)]
    movies: Vec<Movie>,
}

#[derive(Deserialize)]
struct Named {
    description: String,
}

#[derive(Deserialize)]
struct ReleaseDate {
    date: Option<String>,
}

#[derive(Deserialize)]
struct Movie {
    thumbnail: Option<String>,
    mp4: Option<HashMap<String, String>>,
    webm: Option<HashMap<String, String>>,
    hls_h264: Option<String>,
}

fn https(url: String) -> String {
    url.replacen("http://", "https://", 1)
}

impl SteamStore<'_> {
    pub async fn search(&self, term: &str) -> AppResult<Vec<SearchItem>> {
        let res = self
            .http
            .get("https://store.steampowered.com/api/storesearch/")
            .query(&[("term", term), ("l", "spanish"), ("cc", "ES")])
            .send()
            .await?;
        if !res.status().is_success() {
            return Ok(vec![]);
        }
        let body: SearchResp = res.json().await?;
        Ok(body.items)
    }

    pub async fn details(&self, appid: &str) -> AppResult<Option<Metadata>> {
        let res = self
            .http
            .get("https://store.steampowered.com/api/appdetails")
            .query(&[("appids", appid), ("l", "spanish"), ("cc", "ES")])
            .send()
            .await?;
        if !res.status().is_success() {
            return Ok(None);
        }
        let body: HashMap<String, DetailsEntry> = res.json().await?;
        let Some(d) = body.into_values().next().filter(|e| e.success).and_then(|e| e.data) else {
            return Ok(None);
        };

        let release_year = d
            .release_date
            .and_then(|r| r.date)
            .and_then(|s| s.split(|c: char| !c.is_ascii_digit()).filter(|p| p.len() == 4).last().map(str::to_string))
            .and_then(|y| y.parse::<i64>().ok());

        let movie = d.movies.into_iter().next();
        let (trailer_url, trailer_poster) = match movie {
            Some(m) => {
                let pick = |map: Option<HashMap<String, String>>| {
                    map.and_then(|m| m.get("max").or(m.get("480")).cloned())
                };
                // Steam ya solo publica streaming (HLS/DASH) para la mayoría; mp4/webm quedan como primera opción si existen.
                let url = pick(m.mp4).or_else(|| pick(m.webm)).or(m.hls_h264);
                (url.map(https), m.thumbnail.map(https))
            }
            None => (None, None),
        };

        Ok(Some(Metadata {
            steam_appid: Some(appid.to_string()),
            description: d.short_description.map(|s| strip_html(&s)).filter(|s| !s.is_empty()),
            genres: d.genres.into_iter().map(|g| g.description).collect(),
            release_year,
            developer: d.developers.into_iter().next(),
            publisher: d.publishers.into_iter().next(),
            trailer_url,
            trailer_poster,
        }))
    }
}

/// Quita etiquetas HTML y decodifica las entidades más comunes.
fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_html() {
        assert_eq!(strip_html("Un <b>juego</b> &amp; más"), "Un juego & más");
    }
}
