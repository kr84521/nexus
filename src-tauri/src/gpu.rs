//! Preferencia de GPU por ejecutable: lo mismo que Configuración → Pantalla → Gráficos de Windows.
//! Windows la guarda en `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`: el nombre del valor es la
//! ruta del exe y el dato `GpuPreference=N;` (0 = que decida Windows, 1 = ahorro de energía,
//! 2 = alto rendimiento), a veces junto a otras claves (`AppStatus=0;`, `SwapEffectUpgradeEnable=1;`)
//! que se conservan. En portátiles con gráfica integrada + dedicada, sin esta preferencia muchos
//! juegos arrancan en la integrada.

use std::path::{Path, PathBuf};

const KEY: &str = r"Software\Microsoft\DirectX\UserGpuPreferences";
/// Límite de ejecutables por juego (carpetas enormes o mal detectadas).
const MAX_EXES: usize = 300;
const MAX_DEPTH: usize = 5;
/// Carpetas de instaladores y dependencias: no son el juego.
const SKIP_DIRS: &[&str] = &["_commonredist", "commonredist", "redist", "redistributables", "directx", "vcredist", "__installer", "installers"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Plan {
    /// Valor de `GpuPreference` (1 = integrada, 2 = dedicada).
    pub pref: u8,
    /// `true`: sobrescribe lo que hubiera; `false`: solo rellena ejecutables sin preferencia.
    pub force: bool,
}

/// Qué hacer con un juego según su opción (`""` = según el ajuste global, `high`, `low`, `off`).
pub fn plan(game_option: &str, global_dedicated: bool) -> Option<Plan> {
    match game_option {
        "high" => Some(Plan { pref: 2, force: true }),
        "low" => Some(Plan { pref: 1, force: true }),
        "off" => None,
        _ => global_dedicated.then_some(Plan { pref: 2, force: false }),
    }
}

/// Nuevo dato para el registro, o `None` si no hay que tocarlo.
pub fn merge_value(existing: Option<&str>, plan: Plan) -> Option<String> {
    let existing = existing.unwrap_or("");
    let is_pref = |kv: &&str| kv.starts_with("GpuPreference=");
    let parts: Vec<&str> = existing.split(';').map(str::trim).filter(|kv| !kv.is_empty()).collect();
    if !plan.force && parts.iter().any(is_pref) {
        return None; // el usuario ya eligió en Windows: respetarlo
    }
    let mut out = vec![format!("GpuPreference={}", plan.pref)];
    out.extend(parts.iter().filter(|kv| !is_pref(kv)).map(|s| s.to_string()));
    let value = out.join(";") + ";";
    (value != existing).then_some(value)
}

/// Ejecutables bajo la carpeta de instalación (hasta `MAX_DEPTH` niveles, sin redistribuibles).
pub fn find_exes(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let path = e.path();
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                let name = e.file_name().to_string_lossy().to_lowercase();
                if depth < MAX_DEPTH && !SKIP_DIRS.contains(&name.as_str()) {
                    stack.push((path, depth + 1));
                }
            } else if path.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe")) {
                found.push(path);
                if found.len() >= MAX_EXES {
                    return found;
                }
            }
        }
    }
    found
}

/// Aplica la preferencia a todos los ejecutables del juego. Devuelve cuántos ha cambiado.
pub fn apply_to_dir(install_path: &str, plan: Plan) -> usize {
    let root = PathBuf::from(install_path.replace('/', "\\"));
    if !crate::playtime::is_usable_root(install_path) || !root.is_dir() {
        return 0;
    }
    apply_to_exes(&find_exes(&root), plan)
}

#[cfg(windows)]
pub fn apply_to_exes(exes: &[PathBuf], plan: Plan) -> usize {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let Ok((key, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(KEY) else { return 0 };
    let mut changed = 0;
    for exe in exes {
        let name = exe.to_string_lossy().replace('/', "\\");
        let current: Option<String> = key.get_value(&name).ok();
        if let Some(v) = merge_value(current.as_deref(), plan) {
            if key.set_value(&name, &v).is_ok() {
                changed += 1;
            }
        }
    }
    changed
}

#[cfg(not(windows))]
pub fn apply_to_exes(_exes: &[PathBuf], _plan: Plan) -> usize {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    const HIGH: Plan = Plan { pref: 2, force: false };

    #[test]
    fn plan_from_options() {
        assert_eq!(plan("", true), Some(HIGH));
        assert_eq!(plan("", false), None);
        assert_eq!(plan("off", true), None);
        assert_eq!(plan("high", false), Some(Plan { pref: 2, force: true }));
        assert_eq!(plan("low", true), Some(Plan { pref: 1, force: true }));
    }

    #[test]
    fn fills_missing_preference_and_keeps_other_keys() {
        assert_eq!(merge_value(None, HIGH).as_deref(), Some("GpuPreference=2;"));
        assert_eq!(merge_value(Some("AppStatus=0;"), HIGH).as_deref(), Some("GpuPreference=2;AppStatus=0;"));
    }

    #[test]
    fn respects_user_choice_unless_forced() {
        assert_eq!(merge_value(Some("GpuPreference=1;"), HIGH), None);
        let forced = Plan { pref: 2, force: true };
        assert_eq!(merge_value(Some("GpuPreference=1;SwapEffectUpgradeEnable=1;"), forced).as_deref(), Some("GpuPreference=2;SwapEffectUpgradeEnable=1;"));
        assert_eq!(merge_value(Some("GpuPreference=2;"), forced), None);
    }
}
