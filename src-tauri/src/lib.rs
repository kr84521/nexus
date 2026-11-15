mod artwork;
mod commands;
mod db;
mod error;
mod launcher;
mod library;
mod models;
mod scanners;
mod state;

use std::sync::atomic::AtomicBool;
use std::time::Duration;

use tauri::Manager;

use crate::db::Db;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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

            app.manage(AppState { db, http, art_dir, fetching: AtomicBool::new(false) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::get_library,
            commands::library::scan_library,
            commands::library::launch_game,
            commands::library::set_favorite,
            commands::library::set_hidden,
            commands::library::set_custom_title,
            commands::library::set_preferred_source,
            commands::library::open_install_folder,
            commands::library::add_manual_game,
            commands::library::remove_game,
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
            commands::settings::get_settings,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Nexus");
}
