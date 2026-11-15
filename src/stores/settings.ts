import { create } from "zustand";
import { api, errorText } from "@/lib/api";
import { applyTheme, DEFAULT_THEME, normalizeTheme, type Theme } from "@/lib/theme";
import { toast } from "./toast";

interface SettingsState {
  theme: Theme;
  sgdbApiKey: string;
  closeToTray: boolean;
  scanFolders: string[];
  loaded: boolean;
  load: () => Promise<void>;
  updateTheme: (patch: Partial<Theme>) => void;
  resetTheme: () => void;
  setApiKey: (key: string) => Promise<void>;
  setCloseToTray: (v: boolean) => void;
  setScanFolders: (folders: string[]) => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persistTheme(theme: Theme) {
  // Los sliders disparan muchos cambios: se guarda con debounce.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.setSetting("theme", theme).catch((e) => toast.error(errorText(e)));
  }, 400);
}

export const useSettings = create<SettingsState>((set, get) => ({
  theme: DEFAULT_THEME,
  sgdbApiKey: "",
  closeToTray: true,
  scanFolders: [],
  loaded: false,

  load: async () => {
    try {
      const s = await api.getSettings();
      const theme = normalizeTheme(s.theme);
      applyTheme(theme);
      set({
        theme,
        sgdbApiKey: typeof s.sgdbApiKey === "string" ? s.sgdbApiKey : "",
        closeToTray: s.closeToTray !== false,
        scanFolders: Array.isArray(s.scanFolders) ? (s.scanFolders as string[]) : [],
        loaded: true,
      });
    } catch (e) {
      applyTheme(DEFAULT_THEME);
      set({ loaded: true });
      toast.error(errorText(e));
    }
  },

  updateTheme: (patch) => {
    const theme = { ...get().theme, ...patch };
    applyTheme(theme);
    set({ theme });
    persistTheme(theme);
  },

  resetTheme: () => {
    applyTheme(DEFAULT_THEME);
    set({ theme: DEFAULT_THEME });
    persistTheme(DEFAULT_THEME);
  },

  setCloseToTray: (v) => {
    set({ closeToTray: v });
    api.setSetting("closeToTray", v).catch((e) => toast.error(errorText(e)));
  },

  setScanFolders: async (scanFolders) => {
    set({ scanFolders });
    await api.setSetting("scanFolders", scanFolders).catch((e) => toast.error(errorText(e)));
  },

  setApiKey: async (key) => {
    try {
      await api.setSetting("sgdbApiKey", key.trim());
      set({ sgdbApiKey: key.trim() });
      toast.success(key.trim() ? "API key guardada. Descargando arte…" : "API key eliminada");
    } catch (e) {
      toast.error(errorText(e));
    }
  },
}));
