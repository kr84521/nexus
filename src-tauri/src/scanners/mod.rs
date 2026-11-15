//! Un scanner por tienda. Todos leen datos locales (registro, manifiestos) sin iniciar sesión.
//! Para añadir una tienda: crea `<tienda>.rs`, implementa `StoreScanner` y regístralo en `all()`.

use crate::models::{DetectedGame, Store};

mod battlenet;
mod ea;
mod epic;
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

pub fn all() -> Vec<Box<dyn StoreScanner>> {
    vec![
        Box::new(steam::Steam),
        Box::new(epic::Epic),
        Box::new(gog::Gog),
        Box::new(ea::Ea),
        Box::new(ubisoft::Ubisoft),
        Box::new(battlenet::BattleNet),
        Box::new(xbox::Xbox),
    ]
}
