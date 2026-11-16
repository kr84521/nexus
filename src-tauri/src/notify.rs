//! Notificaciones nativas de Windows. Solo se usan cuando la ventana no está a la vista (escondida en la
//! bandeja, minimizada o sin foco); si está visible basta con el aviso interno de la UI.

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

fn enabled(app: &AppHandle) -> bool {
    app.state::<crate::state::AppState>()
        .db
        .get_setting("nativeNotifications")
        .ok()
        .flatten()
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

fn window_in_view(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

pub fn when_hidden(app: &AppHandle, title: &str, body: &str) {
    if !enabled(app) || window_in_view(app) {
        return;
    }
    if let Err(e) = app.notification().builder().title(title).body(body).show() {
        eprintln!("[notify] {e}");
    }
}

pub fn fmt_secs(secs: i64) -> String {
    if secs < 60 {
        return "menos de 1 min".into();
    }
    let min = secs / 60;
    if min < 60 {
        return format!("{min} min");
    }
    let (h, m) = (min / 60, min % 60);
    if m == 0 {
        format!("{h} h")
    } else {
        format!("{h} h {m} min")
    }
}
