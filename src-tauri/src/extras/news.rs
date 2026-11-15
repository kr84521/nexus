//! Novedades del juego desde la API pública de noticias de Steam (sin clave).

use serde::{Deserialize, Serialize};

use crate::error::AppResult;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub title: String,
    pub url: String,
    pub feed: String,
    pub date: i64,
    pub excerpt: String,
}

#[derive(Deserialize)]
struct Resp {
    appnews: Option<AppNews>,
}
#[derive(Deserialize)]
struct AppNews {
    #[serde(default)]
    newsitems: Vec<Raw>,
}
#[derive(Deserialize)]
struct Raw {
    title: String,
    url: String,
    #[serde(default)]
    feedlabel: String,
    #[serde(default)]
    date: i64,
    #[serde(default)]
    contents: String,
}

/// Limpia BBCode de Steam y HTML para mostrar un extracto plano.
fn plain(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth_html = false;
    let mut depth_bb = false;
    for c in s.chars() {
        match c {
            '<' => depth_html = true,
            '>' if depth_html => depth_html = false,
            '[' => depth_bb = true,
            ']' if depth_bb => depth_bb = false,
            c if !depth_html && !depth_bb => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub async fn fetch(http: &reqwest::Client, appid: &str) -> AppResult<Vec<NewsItem>> {
    let res = http
        .get("https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/")
        .query(&[("appid", appid), ("count", "8"), ("maxlength", "400"), ("format", "json")])
        .send()
        .await?;
    if !res.status().is_success() {
        return Ok(vec![]);
    }
    let body: Resp = res.json().await?;
    Ok(body
        .appnews
        .map(|a| a.newsitems)
        .unwrap_or_default()
        .into_iter()
        .map(|r| NewsItem { title: r.title, url: r.url, feed: r.feedlabel, date: r.date * 1000, excerpt: plain(&r.contents) })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_bbcode_and_html() {
        assert_eq!(plain("[h1]Parche[/h1] <b>1.2</b>  ya   [url=x]aquí[/url]"), "Parche 1.2 ya aquí");
    }
}
