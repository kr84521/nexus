//! Utilidades compartidas por los scanners: registro de Windows y entradas de desinstalación.

#[cfg(windows)]
pub use win::*;

#[cfg(windows)]
mod win {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};
    use winreg::{RegKey, HKEY};

    pub const HKLM: HKEY = HKEY_LOCAL_MACHINE;
    pub const HKCU: HKEY = HKEY_CURRENT_USER;

    /// Abre una clave probando primero la vista de 32 bits (donde viven casi todos los launchers) y luego la de 64.
    pub fn open_key(root: HKEY, path: &str) -> Option<RegKey> {
        let base = RegKey::predef(root);
        base.open_subkey_with_flags(path, KEY_READ | KEY_WOW64_32KEY)
            .or_else(|_| base.open_subkey_with_flags(path, KEY_READ | KEY_WOW64_64KEY))
            .ok()
    }

    pub fn read_str(key: &RegKey, name: &str) -> Option<String> {
        key.get_value::<String, _>(name).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
    }

    pub fn subkeys(key: &RegKey) -> Vec<(String, RegKey)> {
        key.enum_keys()
            .flatten()
            .filter_map(|name| key.open_subkey_with_flags(&name, KEY_READ).ok().map(|k| (name, k)))
            .collect()
    }

    /// Entrada de "Agregar o quitar programas".
    pub struct UninstallEntry {
        pub key_name: String,
        pub display_name: String,
        pub install_location: Option<String>,
        pub display_icon: Option<String>,
        pub uninstall_string: Option<String>,
    }

    /// Lee todas las entradas de desinstalación (HKLM 32/64 bits y HKCU).
    pub fn uninstall_entries() -> Vec<UninstallEntry> {
        const PATH: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
        let mut out = Vec::new();
        let mut seen = std::collections::HashSet::new();
        let sources = [
            (HKLM, KEY_WOW64_32KEY),
            (HKLM, KEY_WOW64_64KEY),
            (HKCU, KEY_WOW64_64KEY),
        ];
        for (root, view) in sources {
            let Ok(key) = RegKey::predef(root).open_subkey_with_flags(PATH, KEY_READ | view) else {
                continue;
            };
            for (name, k) in subkeys(&key) {
                let Some(display_name) = read_str(&k, "DisplayName") else { continue };
                if !seen.insert(name.clone()) {
                    continue;
                }
                out.push(UninstallEntry {
                    key_name: name,
                    display_name,
                    install_location: read_str(&k, "InstallLocation"),
                    display_icon: read_str(&k, "DisplayIcon"),
                    uninstall_string: read_str(&k, "UninstallString"),
                });
            }
        }
        out
    }
}

/// Limpia un valor tipo `"C:\x\juego.exe",0` → `C:\x\juego.exe`. Solo devuelve rutas a .exe existentes.
pub fn clean_exe_path(raw: &str) -> Option<String> {
    let s = raw.trim();
    let s = match s.rfind(',') {
        Some(i) if s[i + 1..].trim().parse::<i32>().is_ok() => &s[..i],
        _ => s,
    };
    let s = s.trim().trim_matches('"').trim();
    let p = std::path::Path::new(s);
    let is_exe = p.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false);
    (is_exe && p.is_file()).then(|| s.to_string())
}

/// Extrae `--clave=valor` (con o sin comillas) de una línea de comandos.
pub fn cli_arg(cmdline: &str, key: &str) -> Option<String> {
    let needle = format!("--{key}=");
    let start = cmdline.find(&needle)? + needle.len();
    let rest = &cmdline[start..];
    let value = if let Some(stripped) = rest.strip_prefix('"') {
        stripped.split('"').next()?
    } else {
        rest.split_whitespace().next()?
    };
    Some(value.to_string()).filter(|v| !v.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cli_args() {
        let c = r#""C:\ProgramData\Battle.net\Agent\Blizzard Uninstaller.exe" --lang=enUS --uid=prometheus --displayname="Overwatch 2""#;
        assert_eq!(cli_arg(c, "uid").as_deref(), Some("prometheus"));
        assert_eq!(cli_arg(c, "displayname").as_deref(), Some("Overwatch 2"));
        assert_eq!(cli_arg(c, "missing"), None);
    }
}
