//! Tipos compartidos entre backend y frontend.
//! Cualquier cambio aquí debe reflejarse en `src/types/index.ts`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Store {
    Steam,
    Epic,
    Gog,
    Ea,
    Ubisoft,
    Battlenet,
    Xbox,
    Manual,
}

impl Store {
    pub fn as_str(&self) -> &'static str {
        match self {
            Store::Steam => "steam",
            Store::Epic => "epic",
            Store::Gog => "gog",
            Store::Ea => "ea",
            Store::Ubisoft => "ubisoft",
            Store::Battlenet => "battlenet",
            Store::Xbox => "xbox",
            Store::Manual => "manual",
        }
    }

    pub fn parse(s: &str) -> Option<Store> {
        Some(match s {
            "steam" => Store::Steam,
            "epic" => Store::Epic,
            "gog" => Store::Gog,
            "ea" => Store::Ea,
            "ubisoft" => Store::Ubisoft,
            "battlenet" => Store::Battlenet,
            "xbox" => Store::Xbox,
            "manual" => Store::Manual,
            _ => return None,
        })
    }
}

/// Cómo se lanza un juego concreto.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LaunchTarget {
    /// URI de protocolo (steam://, uplay://, shell:AppsFolder\...).
    Uri { uri: String },
    /// Ejecutable con argumentos y directorio de trabajo opcionales.
    Exe {
        path: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        cwd: Option<String>,
    },
}

/// Un juego tal como lo detecta un scanner (una instalación en una tienda).
#[derive(Debug, Clone)]
pub struct DetectedGame {
    pub store: Store,
    pub store_id: String,
    pub title: String,
    pub install_path: Option<String>,
    pub launch: LaunchTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSource {
    pub id: String,
    pub store: Store,
    pub store_id: String,
    pub title: String,
    pub install_path: Option<String>,
    pub launch: LaunchTarget,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Artwork {
    pub cover: Option<String>,
    pub hero: Option<String>,
    pub logo: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Game {
    pub id: String,
    pub title: String,
    pub custom_title: Option<String>,
    pub favorite: bool,
    pub hidden: bool,
    pub last_played: Option<i64>,
    pub play_count: i64,
    pub added_at: i64,
    pub preferred_source: Option<String>,
    pub sgdb_id: Option<i64>,
    pub artwork: Artwork,
    /// Marca de tiempo del último cambio de arte (para invalidar caché en el frontend).
    pub artwork_version: i64,
    pub playtime_secs: i64,
    pub sources: Vec<GameSource>,
    pub collections: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub sort: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub total: usize,
    pub added: usize,
    pub removed: usize,
    pub per_store: Vec<(Store, usize)>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ArtKind {
    Cover,
    Hero,
    Logo,
    Icon,
}

impl ArtKind {
    pub fn column(&self) -> &'static str {
        match self {
            ArtKind::Cover => "art_cover",
            ArtKind::Hero => "art_hero",
            ArtKind::Logo => "art_logo",
            ArtKind::Icon => "art_icon",
        }
    }
    pub fn name(&self) -> &'static str {
        match self {
            ArtKind::Cover => "cover",
            ArtKind::Hero => "hero",
            ArtKind::Logo => "logo",
            ArtKind::Icon => "icon",
        }
    }
    pub const ALL: [ArtKind; 4] = [ArtKind::Cover, ArtKind::Hero, ArtKind::Logo, ArtKind::Icon];
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtOption {
    pub id: i64,
    pub url: String,
    pub thumb: String,
    pub width: i64,
    pub height: i64,
    pub style: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SgdbGame {
    pub id: i64,
    pub name: String,
    pub release_date: Option<i64>,
}
