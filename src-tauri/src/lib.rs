mod artwork;
mod backup;
mod commands;
mod db;
mod error;
mod launcher;
mod library;
mod metadata;
mod models;
mod playtime;
mod saves;
mod scanners;
mod state;
mod stats;
mod tray;

use std::sync::atomic::AtomicBool;
use std::time::Duration;

use tauri::{Manager, WindowEvent};

use crate::db::Db;
use crate::state::AppState;

/// Argumento con el que el arranque automático abre Nexus escondido en la bandeja.
pub const ARG_MINIMIZED: &str = "--minimized";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Debe ir el primero: si ya hay una instancia, le pasa el control y esta sale.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![ARG_MINIMIZED]),
        ))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let art_dir = data_dir.join("artwork");
            std::fs::create_dir_all(&art_dir)?;

            let db = Db::open(&data_dir.join("library.db"))?;
            let http = reqwest::Client::builder()
                .user_agent(concat!("NexusLauncher/", env!("CARGO_PKG_VERSION")))
                .timeout(Duration::from_secs(30))
                .build()?;

            app.manage(AppState {
                db,
                http,
                art_dir,
                fetching: AtomicBool::new(false),
                fetching_meta: AtomicBool::new(false),
            });
            tray::build(app.handle())?;

            // Tareas de fondo al arrancar: colores de portada pendientes y metadatos que falten.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                artwork::backfill_colors(&handle.state::<AppState>());
                metadata::spawn_fetch_missing(handle.clone());
            });

            let minimized = std::env::args().any(|a| a == ARG_MINIMIZED);
            if !minimized {
                if let Some(w) = app.get_webview_window("main") {
                    w.show()?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && tray::close_to_tray(window.app_handle()) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::get_library,
            commands::library::scan_library,
            commands::library::launch_game,
            commands::library::set_launch_options,
            commands::library::get_stats,
            commands::library::set_favorite,
            commands::library::set_hidden,
            commands::library::set_custom_title,
            commands::library::set_preferred_source,
            commands::library::open_install_folder,
            commands::library::add_manual_game,
            commands::library::remove_game,
            commands::library::merge_games,
            commands::library::split_source,
            commands::library::create_collection,
            commands::library::rename_collection,
            commands::library::delete_collection,
            commands::library::set_in_collection,
            commands::artwork::art_options,
            commands::artwork::set_art_from_url,
            commands::artwork::set_art_from_file,
            commands::artwork::clear_art,
            commands::artwork::sgdb_search,
            commands::artwork::set_sgdb_game,
            commands::artwork::refetch_missing_art,
            commands::artwork::refetch_missing_metadata,
            commands::settings::get_settings,
            commands::settings::set_setting,
            commands::files::set_background_image,
            commands::files::write_text_file,
            commands::files::read_text_file,
            commands::files::export_library,
            commands::files::import_library,
            commands::saves::saves_info,
            commands::saves::backup_saves,
            commands::saves::restore_saves,
            commands::saves::open_path,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Nexus");
}
