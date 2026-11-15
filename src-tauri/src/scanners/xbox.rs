//! Xbox / Microsoft Store (Game Pass para PC). Los juegos son paquetes MSIX que incluyen
//! `MicrosoftGame.config`. Se consultan con PowerShell (Get-AppxPackage) y se lanzan con
//! `shell:AppsFolder\<PackageFamilyName>!<AppId>`.

use std::os::windows::process::CommandExt;
use std::process::Command;

use serde::Deserialize;

use super::StoreScanner;
use crate::models::{DetectedGame, LaunchTarget, Store};

pub struct Xbox;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out = @(Get-AppxPackage | Where-Object {
    -not $_.IsFramework -and $_.SignatureKind -eq 'Store' -and $_.InstallLocation -and
    (Test-Path -LiteralPath (Join-Path $_.InstallLocation 'MicrosoftGame.config'))
} | ForEach-Object {
    $m = Get-AppxPackageManifest $_
    $app = @($m.Package.Applications.Application)[0]
    $name = $m.Package.Properties.DisplayName
    if (-not $name -or $name -like 'ms-resource:*') {
        try {
            [xml]$cfg = Get-Content -LiteralPath (Join-Path $_.InstallLocation 'MicrosoftGame.config') -Raw
            $name = $cfg.Game.ShellVisuals.DefaultDisplayName
        } catch {}
    }
    if (-not $name -or $name -like 'ms-resource:*') { $name = $_.Name }
    [pscustomobject]@{ pfn = $_.PackageFamilyName; name = $name; appId = $app.Id; location = $_.InstallLocation }
})
ConvertTo-Json -InputObject $out -Compress
"#;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Pkg {
    pfn: String,
    name: String,
    app_id: Option<String>,
    location: Option<String>,
}

impl StoreScanner for Xbox {
    fn store(&self) -> Store {
        Store::Xbox
    }

    fn scan(&self) -> Result<Vec<DetectedGame>, String> {
        let output = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Xbox: no se pudo ejecutar PowerShell: {e}"))?;

        let text = String::from_utf8_lossy(&output.stdout);
        let text = text.trim().trim_start_matches('\u{feff}');
        if text.is_empty() {
            return Ok(vec![]);
        }
        let pkgs: Vec<Pkg> = serde_json::from_str(text).map_err(|e| format!("Xbox: salida inesperada: {e}"))?;

        Ok(pkgs
            .into_iter()
            .filter_map(|p| {
                let app_id = p.app_id?;
                Some(DetectedGame {
                    store: Store::Xbox,
                    store_id: p.pfn.clone(),
                    title: p.name,
                    install_path: p.location,
                    launch: LaunchTarget::Uri { uri: format!(r"shell:AppsFolder\{}!{}", p.pfn, app_id) },
                })
            })
            .collect())
    }
}
