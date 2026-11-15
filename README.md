# Nexus

Launcher unificado para Windows. Detecta los juegos instalados de Steam, Epic Games, GOG, EA App, Ubisoft Connect, Battle.net y Xbox (Game Pass), los junta en una sola biblioteca con arte de SteamGridDB y los lanza desde una interfaz limpia y personalizable.

## Características

- Escaneo local sin iniciar sesión en ninguna tienda; agrupa el mismo juego instalado en varias tiendas.
- Portada, fondo (héroe), logo e icono descargados automáticamente; selector de alternativas o imagen propia para cada uno.
- Favoritos, colecciones propias, juegos ocultos, títulos personalizados, añadir ejecutables a mano.
- Temas: presets (Medianoche, OLED, Pizarra, Claro), color de acento, fuente, radio de esquinas, tamaño de portadas, fondo dinámico desenfocado, efecto cristal.
- Atajos: `Ctrl+F` buscar · `F5` escanear · doble clic en una portada para jugar · `Esc` volver.

## Desarrollo

Requisitos: Node 24, Rust (toolchain MSVC) y Visual Studio Build Tools con "Desarrollo de escritorio con C++".

```
npm install
npm run app        # desarrollo con hot reload
npm run app:build  # instalador en src-tauri/target/release/bundle/
```

Para el arte, crea una API key gratuita en [steamgriddb.com](https://www.steamgriddb.com/profile/preferences/api) y pégala en Ajustes.
