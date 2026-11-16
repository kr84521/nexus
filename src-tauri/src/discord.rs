//! Discord Rich Presence: "Jugando a X" en tu perfil mientras el juego está abierto.
//! Requiere un Application ID propio (ajuste `discordAppId`): se crea gratis en
//! discord.com/developers/applications. Sin ID, no hace nada. Usa el IPC local de Discord;
//! si Discord no está abierto, falla en silencio.

use std::sync::Mutex;

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::{AppHandle, Manager};

use crate::models::Game;
use crate::state::AppState;

static CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);

fn app_id(app: &AppHandle) -> Option<String> {
    app.state::<AppState>()
        .db
        .get_setting("discordAppId")
        .ok()
        .flatten()
        .and_then(|v| v.as_str().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
}

/// Imagen grande: la portada de Steam si el juego existe allí (Discord admite URLs https).
fn image_url(game: &Game) -> Option<String> {
    crate::extras::steam_appid(game).map(|id| format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/library_600x900.jpg"))
}

pub fn set_playing(app: &AppHandle, game: &Game, started_unix: i64) {
    let Some(id) = app_id(app) else { return };
    let title = game.custom_title.clone().unwrap_or_else(|| game.title.clone());
    let mut guard = CLIENT.lock().unwrap_or_else(|e| e.into_inner());
    if guard.is_none() {
        let Ok(mut c) = DiscordIpcClient::new(&id) else { return };
        if c.connect().is_err() {
            return; // Discord no está abierto
        }
        *guard = Some(c);
    }
    let Some(client) = guard.as_mut() else { return };
    let image = image_url(game);
    let mut assets = activity::Assets::new();
    if let Some(url) = image.as_deref() {
        assets = assets.large_image(url).large_text(&title);
    }
    let act = activity::Activity::new()
        .details(&title)
        .state("a través de Nexus")
        .timestamps(activity::Timestamps::new().start(started_unix))
        .assets(assets);
    if client.set_activity(act).is_err() {
        let _ = client.close();
        *guard = None;
    }
}

pub fn clear(app: &AppHandle) {
    if app_id(app).is_none() {
        return;
    }
    let mut guard = CLIENT.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(mut c) = guard.take() {
        let _ = c.clear_activity();
        let _ = c.close();
    }
}
