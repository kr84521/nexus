//! Un scanner por tienda. Todos leen datos locales (registro, manifiestos) sin iniciar sesión.
//! Para añadir una tienda: crea `<tienda>.rs`, implementa `StoreScanner` y regístralo en `all()`.

use crate::models::{DetectedGame, Store};

mod battlenet;
mod ea;
mod epic;
pub mod folders;
mod gog;
mod steam;
mod ubisoft;
pub mod util;
mod vdf;
mod xbox;

pub trait StoreScanner: Send + Sync {
    fn store(&self) -> Store;
    /// Devuelve los juegos instalados. Si la tienda no está instalada devuelve `Ok(vec![])`;
    /// `Err` solo cuando algo inesperado impide escanear (en ese caso no se borra nada de esa tienda).
    fn scan(&self) -> Result<Vec<DetectedGame>, String>;
}

/// `folders`: carpetas elegidas por el usuario que se escanean en busca de ejecutables.
pub fn all(folders: Vec<String>) -> Vec<Box<dyn StoreScanner>> {
    vec![
        Box::new(folders::Folders { roots: folders }),
        Box::new(steam::Steam),
        Box::new(epic::Epic),
        Box::new(gog::Gog),
        Box::new(ea::Ea),
        Box::new(ubisoft::Ubisoft),
        Box::new(battlenet::BattleNet),
        Box::new(xbox::Xbox),
    ]
}
