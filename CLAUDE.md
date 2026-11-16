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
cd src-tauri && cargo test          # tests unitarios de Rust (parsers, migraciones de BD, fusionar/separar, rachas…)
cd src-tauri && cargo test vdf      # un solo test/módulo por nombre
NEXUS_MANIFEST=<ruta manifest.yaml> cargo test real_manifest -- --ignored --nocapture   # parser de partidas contra el manifiesto real
cd src-tauri && cargo clippy
```

Notas de la toolchain: TypeScript 7 (no admite `baseUrl`; el alias `@/` va en `paths` con `./src/*`). Vite 8 usa Oxc, no esbuild (`minify: true`, nunca `"esbuild"`). Tailwind v4 se configura en CSS (`@theme inline` en `src/styles.css`), no hay `tailwind.config`.

Datos en tiempo de ejecución: `%APPDATA%\dev.nexus.launcher\` → `library.db` (SQLite) y `artwork/<juego>/<tipo>-<ts>.<ext>`. Borrar `library.db` reinicia la biblioteca.

No lanzar `tauri dev` si el usuario ya tiene uno abierto (puerto 1420 ocupado): su instancia recompila sola al guardar. Comprobar con `netstat -ano | grep 1420`.

Actualizador: clave privada en `~/.tauri/nexus.key` (fuera del repo; si se pierde no se pueden firmar más actualizaciones). Firmar al compilar: `TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/nexus.key) npm run app:build`. El endpoint (`plugins.updater.endpoints` en `tauri.conf.json`) debe apuntar al `latest.json` de las GitHub Releases.

## Arquitectura

### Flujo principal

1. Frontend llama `invoke("scan_library")` (`src/lib/api.ts` → `src-tauri/src/commands/library.rs`).
2. `library::scan_all` ejecuta cada `StoreScanner` en su propio hilo y recoge `DetectedGame`s.
3. `Db::apply_scan` sincroniza con SQLite: inserta/actualiza `sources`, agrupa en `games` por título normalizado (`library::game_id_for`), y **solo elimina fuentes de tiendas cuyo scanner terminó sin error** (si un scanner falla no se borra su biblioteca).
4. `artwork::spawn_fetch_missing` descarga en segundo plano el arte que falte (SteamGridDB → fallback CDN de Steam) y emite eventos `artwork-updated` (por juego) y `artwork-done`; el frontend recarga el juego al recibirlos. Al terminar encadena `metadata::spawn_fetch_missing` (Store de Steam: descripción, géneros, año, desarrollador, tráiler), que reutiliza `artwork-updated`.
5. `launch_game` aplica las `launch_options` del juego (argumentos, comando previo, admin), lanza y arranca `playtime::track` en un hilo: espera a que aparezca un proceso cuyo exe esté bajo la carpeta de instalación (o el PID hijo), emite `game-running` y al cerrarse registra la sesión en `sessions`, suma `playtime_secs`, emite `session-ended`, ejecuta el comando posterior, cierra la tienda si se pidió y hace copia de partidas si `autoBackupSaves` está activo.

### Modelo de datos (clave para entender todo)

- **`games`**: un juego lógico. `id = "g:<título normalizado>"` (o `"m:<ts>"` para manuales). Guarda favorito, oculto, título personalizado, arte elegido, `sgdb_id`, `art_fetched`.
- **`sources`**: una instalación concreta en una tienda. `id = "<store>:<store_id>"`. Un juego puede tener varias (Steam + Epic). Cada fuente guarda su `LaunchTarget` como JSON.
- `LaunchTarget` es `Uri` (steam://, uplay://, shell:AppsFolder\...) o `Exe` (ruta + args + cwd). `launcher.rs` abre URIs con `explorer.exe` y ejecutables con `Command`.
- **`metadata`** (1:1 con games, incluye `metacritic`), **`launch_options`** (1:1), **`sessions`** (tiempo de juego; `stats.rs` las agrega para la página Actividad) y **`steam_owned`** (biblioteca completa de la cuenta de Steam, de la Web API).
- `games.status` (`none|backlog|playing|completed|dropped`), `rating` (0-5) y `notes` son el backlog del usuario. `playtime_secs` es el total mostrado; `external_playtime_secs` es la parte importada de Steam (`steam_sync::sync` hace `playtime_secs = playtime_secs - external + nuevo_external`, por eso es idempotente).
- `sources.size_bytes` se calcula en un hilo tras cada escaneo (`library::spawn_compute_sizes`) y al arrancar. `games.art_color` es el color dominante de la portada (calculado con `artwork::color` al guardarla; `""` = no se pudo calcular).
- Fuentes manuales: `manual:<ts>` (añadido a mano, nunca se borra al escanear) vs `manual:dir:<ruta>` (scanner de carpetas, se borra si desaparece). `Store::Rom` son ROMs del scanner `scanners/roms.rs` (ajuste `emulators`, `{rom}` en los argumentos); su `install_path` es la carpeta del emulador para que el seguimiento de tiempo detecte su proceso.
- Fusionar (`merge_games`) mueve fuentes/sesiones/colecciones a otro juego; separar (`split_source`) crea `g:<título>#<store>`. Los rescaneos respetan ambos porque `apply_scan` busca primero el `game_id` actual de cada fuente.
- `models.rs` ⇄ `src/types/index.ts` son espejo: cambiar uno obliga a cambiar el otro. Serde usa `camelCase` en la frontera.

### Backend (`src-tauri/src/`)

- `commands/` — la API que ve el frontend; cada función `#[tauri::command]` se registra en `lib.rs::generate_handler!`. Los comandos devuelven el `Game` actualizado para que el store lo reemplace con `upsert`.
- `scanners/` — trait `StoreScanner { store(), scan() }`; un archivo por tienda, registrado en `scanners::all()`. `util.rs` (registro de Windows, entradas de desinstalación, `clean_exe_path`, `cli_arg`), `vdf.rs` (parser KeyValues de Valve). Xbox ejecuta un script de PowerShell (`Get-AppxPackage`) porque no hay API Rust sencilla.
- `db/` — `Db` envuelve `Mutex<Connection>`; nunca mantener el lock a través de un `.await`. Esquema en `schema.sql` (`IF NOT EXISTS`, define el estado final). Cambios a tablas existentes van en `migrate()` con `PRAGMA user_version` (una entrada por versión; subir `SCHEMA_VERSION`) usando `add_column`, que comprueba si la columna existe: `schema.sql` corre antes y puede haber creado la tabla ya con las columnas nuevas. Una BD nueva salta directamente a `SCHEMA_VERSION`.
- `playtime.rs` — seguimiento de procesos con `sysinfo`. `tray.rs` — icono de bandeja (abrir/escanear/salir), `close_to_tray` lee el ajuste `closeToTray`. La ventana nace oculta (`visible: false`) y `setup` la muestra salvo con `--minimized` (lo pasa el arranque automático).
- `metadata/` — cliente de la Store de Steam (`storesearch` + `appdetails`, sin clave). Para juegos no-Steam solo acepta el resultado si el título normalizado coincide.
- `saves/` — copias de partidas. `manifest.rs` descarga y parsea el manifiesto de Ludusavi (18 MB YAML, caché en AppData una semana, ~1 s en release; se parsea una vez por ejecución y se guarda en un `static`); solo entradas Windows con tag `save`. Sustituye `<winAppData>`, `<base>`… y expande globs. Las copias van a `savesDir` (ajuste) o `AppData/saves`, 5 por juego, con `backup.json` que guarda las rutas originales para restaurar. Los comandos corren en `spawn_blocking` porque la descarga usa `reqwest::blocking`.
- `extras/` — capturas (carpeta de Steam `userdata/*/760/remote/<appid>/screenshots` y Vídeos/Capturas de la Game Bar), noticias (API pública de Steam) y logros (Web API con clave `steamWebApiKey` + `steamId` detectado de `loginusers.vdf`). `steam_appid()` usa la fuente Steam o `metadata.steam_appid`, así funcionan en juegos de otras tiendas que existen en Steam.
- `backup.rs` — exportar/importar la biblioteca a una carpeta (`nexus-library.json` + `artwork/`); la importación hace upsert por id sin borrar nada.
- `steam_sync.rs` — `GetOwnedGames` con `steamWebApiKey` + `steamId`: rellena `steam_owned` y las horas externas. Se ejecuta al arrancar si hay clave (emite `library-changed`) y desde Ajustes.
- `notify.rs` — notificaciones nativas (plugin notification) solo cuando la ventana no está visible/enfocada (ajuste `nativeNotifications`).
- `discord.rs` — Rich Presence por IPC (`discord-rich-presence`); requiere `discordAppId`; la portada es la URL del CDN de Steam. Se activa/limpia desde `playtime.rs`.
- `tray.rs` reconstruye el menú con los 5 últimos jugados (`play:<id>`); `refresh_recent` se llama tras lanzar y tras escanear. El lanzamiento está en `commands::library::launch_by_id` para compartirlo con la bandeja.
- `library::merge_suggestions` — pares de juegos de tiendas distintas con título "núcleo" igual (sin palabras de edición) o uno prefijo del otro; `ignoredMergePairs` guarda los descartados.
- **HowLongToBeat se descartó a propósito**: no tiene API y obtener su endpoint firmado requiere extraer la clave de su JS, lo que el sistema de permisos bloqueó como acceso no autorizado. No volver a intentarlo salvo que aparezca una API oficial.
- `stats.rs` — agregados de `sessions` (semana/mes/total, mapa anual, top, racha con aritmética de fechas propia).
- `artwork/` — descarga/importa imágenes, borra la versión anterior del mismo tipo, actualiza `art_version` (cache-busting en el frontend). `steamgriddb.rs` es el cliente API v2.
- `error.rs` — `AppError` serializa como string; `AppResult<T>` es el tipo de retorno de todos los comandos.
- `state.rs` — `AppState` (db, cliente HTTP, carpeta de arte, flag `fetching`) gestionado por Tauri.

### Frontend (`src/`)

- `lib/api.ts` — wrappers tipados de `invoke`; nombre de función = nombre del comando. Argumentos en camelCase (Tauri los convierte a snake_case).
- `stores/library.ts` — estado Zustand: juegos, colecciones, filtro, búsqueda, orden, página, selección. `selectVisible()` aplica filtro+búsqueda+orden. Mutaciones usan `mutate()` que llama al comando y hace `upsert` del resultado.
- `stores/settings.ts` + `lib/theme.ts` — el tema es un objeto `Theme` que `applyTheme` vuelca en variables CSS de `:root` (`--bg`, `--accent`, `--cover-w`, …). Tailwind las expone como `bg-bg`, `text-fg`, `bg-accent`, `border-line`, `rounded-card`. Añadir una opción de tema = campo en `Theme`, línea en `applyTheme`, control en `SettingsView`.
- `features/` — `library/` (cuadrícula `LibraryView`, vista destacados `RowsView`, tarjeta, menú contextual `useGameMenu`, fondo dinámico, añadir manual), `game-detail/` (héroe/tráiler + logo + portada + acciones, `SourcesPanel` para fusionar/separar), `artwork/` (selector de alternativas; se abre globalmente con `useLibrary().openArt(id)`), `settings/`.
- `lib/hotkey.ts` — atajo global (plugin global-shortcut) que muestra la ventana y abre la `CommandPalette` (Ctrl+K). Se registra desde `settings.load()`.
- `lib/useVirtualGrid.ts` — virtualización de la cuadrícula: replica el cálculo de columnas de `auto-fill minmax(var(--cover-w), 1fr)`; el contenedor de scroll lleva `ref` y la cuadrícula `data-virtual-grid`.
- Modo TV (`tvMode` en el store, F11 / Select del mando): pantalla completa, sin `Sidebar`/`TitleBar`, `TvBar` con pestañas; `html[data-tv="true"]` y `applyTheme` fuerzan portadas ≥ 240px.
- Paneles de la ficha (`game-detail/`): `LaunchOptionsModal`, `SavesPanel`, `ExtrasPanels` (capturas/novedades/logros), `StatusControls` (estado/estrellas/notas con autoguardado).
- `library/OwnedView` (página `owned`: juegos de Steam no instalados, portadas del CDN, `steam://install/`), `library/Roulette` (elige al azar), `library/MergeSuggestions` (aviso + modal; la fusión conserva el juego con más horas/arte).
- `lib/status.ts` define etiquetas y colores de estado; se usan en tarjeta (punto inferior derecho), ficha, barra lateral y menú contextual. Las capturas se sirven con `asset:` fuera de AppData, por eso el scope del protocolo es `**`.
- `lib/gamepad.ts` — navegación espacial con mando sobre elementos enfocables; las tarjetas llevan `data-game-id`, los modales `data-modal` (limitan la navegación) y `data-nav="skip"` excluye elementos. Con mando conectado `html[data-gamepad="true"]` fuerza el anillo de foco.
- Acento por juego: `GameDetail` sobrescribe `--accent`/`--accent-fg` en su contenedor con `game.artColor`, así todo `bg-accent` dentro cambia sin tocar componentes.
- Tráileres: Steam los sirve en HLS; `TrailerVideo` usa `hls.js`. La CSP permite `connect-src https://*.steamstatic.com` y `media-src https: blob:`.
- Las imágenes locales se muestran con `convertFileSrc` (protocolo `asset:`); el scope `$APPDATA/**` está en `tauri.conf.json`. Si se cambia la carpeta de arte hay que actualizar ese scope y la CSP.
- Ventana sin decoraciones: `app/TitleBar.tsx` usa `data-tauri-drag-region`; los permisos de ventana están en `src-tauri/capabilities/default.json`.

## Convenciones

- Ajustes se guardan como JSON libre en la tabla `settings` (`theme`, `sgdbApiKey`, `closeToTray`, `scanFolders`, `emulators`, `quickSearch`, `savesDir`, `autoBackupSaves`, `steamWebApiKey`, `steamId`, `nativeNotifications`, `discordAppId`, `ignoredMergePairs`); el frontend define la forma y normaliza con valores por defecto. El backend lee algunos directamente (`closeToTray`, `scanFolders`, `emulators`, `autoBackupSaves`, `savesDir`, claves de Steam).
- Los scanners devuelven `Ok(vec![])` si la tienda no está instalada; `Err` solo ante fallos reales.
- No añadir dependencias de Tauri plugins sin registrar también su permiso en `capabilities/default.json`.
