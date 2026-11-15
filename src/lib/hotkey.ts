// Atajo de teclado global (funciona aunque Nexus esté en la bandeja): abre la ventana y la búsqueda rápida.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { useLibrary } from "@/stores/library";
import { errorText } from "./api";

export const DEFAULT_SHORTCUT = "CommandOrControl+Shift+Space";

/** (Re)registra el atajo. Devuelve un mensaje de error si la combinación no es válida o está ocupada. */
export async function applyHotkey(enabled: boolean, shortcut: string): Promise<string | null> {
  try {
    await unregisterAll();
    if (!enabled || !shortcut.trim()) return null;
    await register(shortcut.trim(), async (e) => {
      if (e.state !== "Pressed") return;
      const win = getCurrentWindow();
      await win.show();
      await win.unminimize();
      await win.setFocus();
      useLibrary.getState().setPaletteOpen(true);
    });
    return null;
  } catch (e) {
    return errorText(e);
  }
}
