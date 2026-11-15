use std::path::PathBuf;
use std::sync::atomic::AtomicBool;

use crate::db::Db;

pub struct AppState {
    pub db: Db,
    pub http: reqwest::Client,
    pub art_dir: PathBuf,
    /// Evita dos descargas de arte en paralelo.
    pub fetching: AtomicBool,
    pub fetching_meta: AtomicBool,
}
