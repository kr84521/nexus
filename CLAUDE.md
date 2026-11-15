# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

Nexus: launcher de escritorio para Windows que detecta los juegos instalados de todas las tiendas (Steam, Epic, GOG, EA App, Ubisoft Connect, Battle.net, Xbox/Game Pass y ejecutables añadidos a mano), los agrupa en una biblioteca única con arte de SteamGridDB y los lanza desde una UI personalizable. Tauri 2 (Rust) + React 19 / TypeScript / Tailwind v4. El idioma de la UI, comentarios y mensajes es español.

## Comandos

Requisitos: Node 24, Rust (MSVC) y Visual Studio Build Tools con "Desarrollo de escritorio con C++". `cargo` está en `~/.cargo/bin` (añadir al PATH en Git Bash: `export PATH="$HOME/.cargo/bin:$PATH"`).

```
npm run app          # tauri dev: levanta Vite y la ventana nativa con hot reload (frontend) y recompilación (Rust)
npm run app:build    # instalador NSIS en src-tauri/target/release/bundle/
npm run typecheck    # tsc, solo tipos
npm run build        # tsc + vite build → dist/ (tauri build lo invoca solo)
cd src-tauri && cargo build         # solo backend
cd src-tauri && cargo test          # tests unitarios de Rust (parser VDF, normalización de títulos, args CLI)
cd src-tauri && cargo test vdf      # un solo test/módulo por nombre
cd src-tauri && cargo clippy
```

Notas de la toolchain: TypeScript 7 (no admite `baseUrl`; el alias `@/` va en `paths` con `./src/*`). Vite 8 usa Oxc, no esbuild (`minify: true`, nunca `"esbuild"`). Tailwind v4 se configura en CSS (`@theme inline` en `src/styles.css`), no hay `tailwind.config`.

Datos en tiempo de ejecución: `%APPDATA%\dev.nexus.launcher\` → `library.db` (SQLite) y `artwork/<juego>/<tipo>-<ts>.<ext>`. Borrar `library.db` reinicia la biblioteca.

## Arquitectura

### Flujo principal

1. Frontend llama `invoke("scan_library")` (`src/lib/api.ts` → `src-tauri/src/commands/library.rs`).
2. `library::scan_all` ejecuta cada `StoreScanner` en su propio hilo y recoge `DetectedGame`s.
3. `Db::apply_scan` sincroniza con SQLite: inserta/actualiza `sources`, agrupa en `games` por título normalizado (`library::game_id_for`), y **solo elimina fuentes de tiendas cuyo scanner terminó sin error** (si un scanner falla no se borra su biblioteca).
4. `artwork::spawn_fetch_missing` descarga en segundo plano el arte que falte (SteamGridDB → fallback CDN de Steam) y emite eventos `artwork-updated` (por juego) y `artwork-done`; el frontend recarga el juego al recibirlos.

### Modelo de datos (clave para entender todo)

- **`games`**: un juego lógico. `id = "g:<título normalizado>"` (o `"m:<ts>"` para manuales). Guarda favorito, oculto, título personalizado, arte elegido, `sgdb_id`, `art_fetched`.
- **`sources`**: una instalación concreta en una tienda. `id = "<store>:<store_id>"`. Un juego puede tener varias (Steam + Epic). Cada fuente guarda su `LaunchTarget` como JSON.
- `LaunchTarget` es `Uri` (steam://, uplay://, shell:AppsFolder\...) o `Exe` (ruta + args + cwd). `launcher.rs` abre URIs con `explorer.exe` y ejecutables con `Command`.
- `models.rs` ⇄ `src/types/index.ts` son espejo: cambiar uno obliga a cambiar el otro. Serde usa `camelCase` en la frontera.

### Backend (`src-tauri/src/`)

- `commands/` — la API que ve el frontend; cada función `#[tauri::command]` se registra en `lib.rs::generate_handler!`. Los comandos devuelven el `Game` actualizado para que el store lo reemplace con `upsert`.
- `scanners/` — trait `StoreScanner { store(), scan() }`; un archivo por tienda, registrado en `scanners::all()`. `util.rs` (registro de Windows, entradas de desinstalación, `clean_exe_path`, `cli_arg`), `vdf.rs` (parser KeyValues de Valve). Xbox ejecuta un script de PowerShell (`Get-AppxPackage`) porque no hay API Rust sencilla.
- `db/` — `Db` envuelve `Mutex<Connection>`; nunca mantener el lock a través de un `.await`. Esquema en `schema.sql` (se ejecuta con `IF NOT EXISTS` al arrancar; no hay migraciones todavía).
- `artwork/` — descarga/importa imágenes, borra la versión anterior del mismo tipo, actualiza `art_version` (cache-busting en el frontend). `steamgriddb.rs` es el cliente API v2.
- `error.rs` — `AppError` serializa como string; `AppResult<T>` es el tipo de retorno de todos los comandos.
- `state.rs` — `AppState` (db, cliente HTTP, carpeta de arte, flag `fetching`) gestionado por Tauri.

### Frontend (`src/`)

- `lib/api.ts` — wrappers tipados de `invoke`; nombre de función = nombre del comando. Argumentos en camelCase (Tauri los convierte a snake_case).
- `stores/library.ts` — estado Zustand: juegos, colecciones, filtro, búsqueda, orden, página, selección. `selectVisible()` aplica filtro+búsqueda+orden. Mutaciones usan `mutate()` que llama al comando y hace `upsert` del resultado.
- `stores/settings.ts` + `lib/theme.ts` — el tema es un objeto `Theme` que `applyTheme` vuelca en variables CSS de `:root` (`--bg`, `--accent`, `--cover-w`, …). Tailwind las expone como `bg-bg`, `text-fg`, `bg-accent`, `border-line`, `rounded-card`. Añadir una opción de tema = campo en `Theme`, línea en `applyTheme`, control en `SettingsView`.
- `features/` — `library/` (cuadrícula, tarjeta, fondo dinámico, añadir manual), `game-detail/` (héroe + logo + portada + acciones), `artwork/` (selector de alternativas, subir imagen, corregir coincidencia SGDB), `settings/`.
- Las imágenes locales se muestran con `convertFileSrc` (protocolo `asset:`); el scope `$APPDATA/**` está en `tauri.conf.json`. Si se cambia la carpeta de arte hay que actualizar ese scope y la CSP.
- Ventana sin decoraciones: `app/TitleBar.tsx` usa `data-tauri-drag-region`; los permisos de ventana están en `src-tauri/capabilities/default.json`.

## Convenciones

- Ajustes se guardan como JSON libre en la tabla `settings` (`theme`, `sgdbApiKey`); el frontend define la forma y normaliza con valores por defecto (`normalizeTheme`).
- Los scanners devuelven `Ok(vec![])` si la tienda no está instalada; `Err` solo ante fallos reales.
- No añadir dependencias de Tauri plugins sin registrar también su permiso en `capabilities/default.json`.
