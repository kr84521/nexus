import { create } from "zustand";
import { api, errorText } from "@/lib/api";
import { applyHotkey, DEFAULT_SHORTCUT } from "@/lib/hotkey";
import { applyTheme, DEFAULT_THEME, normalizeTheme, type Theme } from "@/lib/theme";
import { toast } from "./toast";

export interface EmulatorConfig {
  id: string;
  name: string;
  exePath: string;
  args: string;
  romsDir: string;
  extensions: string[];
  platform: string;
}

interface SettingsState {
  theme: Theme;
  sgdbApiKey: string;
  closeToTray: boolean;
  scanFolders: string[];
  quickSearch: { enabled: boolean; shortcut: string };
  emulators: EmulatorConfig[];
  savesDir: string;
  autoBackupSaves: boolean;
  steamWebApiKey: string;
  steamId: string;
  loaded: boolean;
  load: () => Promise<void>;
  updateTheme: (patch: Partial<Theme>) => void;
  resetTheme: () => void;
  setApiKey: (key: string) => Promise<void>;
  setCloseToTray: (v: boolean) => void;
  setScanFolders: (folders: string[]) => Promise<void>;
  setQuickSearch: (q: { enabled: boolean; shortcut: string }) => Promise<void>;
  setEmulators: (list: EmulatorConfig[]) => Promise<void>;
  setSavesDir: (dir: string) => Promise<void>;
  setAutoBackupSaves: (v: boolean) => Promise<void>;
  setSteamWebApiKey: (k: string) => Promise<void>;
  setSteamId: (id: string) => Promise<void>;
}

function normalizeQuickSearch(raw: unknown): { enabled: boolean; shortcut: string } {
  const r = (raw ?? {}) as Partial<{ enabled: boolean; shortcut: string }>;
  return { enabled: r.enabled !== false, shortcut: typeof r.shortcut === "string" && r.shortcut ? r.shortcut : DEFAULT_SHORTCUT };
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
  quickSearch: { enabled: true, shortcut: DEFAULT_SHORTCUT },
  emulators: [],
  savesDir: "",
  autoBackupSaves: false,
  steamWebApiKey: "",
  steamId: "",
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
        quickSearch: normalizeQuickSearch(s.quickSearch),
        emulators: Array.isArray(s.emulators) ? (s.emulators as EmulatorConfig[]) : [],
        savesDir: typeof s.savesDir === "string" ? s.savesDir : "",
        autoBackupSaves: s.autoBackupSaves === true,
        steamWebApiKey: typeof s.steamWebApiKey === "string" ? s.steamWebApiKey : "",
        steamId: typeof s.steamId === "string" ? s.steamId : "",
        loaded: true,
      });
      const q = normalizeQuickSearch(s.quickSearch);
      const err = await applyHotkey(q.enabled, q.shortcut);
      if (err) toast.error(`Atajo global no disponible: ${err}`);
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

  setEmulators: async (emulators) => {
    set({ emulators });
    await api.setSetting("emulators", emulators).catch((e) => toast.error(errorText(e)));
  },
  setSavesDir: async (savesDir) => {
    set({ savesDir });
    await api.setSetting("savesDir", savesDir).catch((e) => toast.error(errorText(e)));
  },
  setSteamWebApiKey: async (steamWebApiKey) => {
    set({ steamWebApiKey: steamWebApiKey.trim() });
    await api.setSetting("steamWebApiKey", steamWebApiKey.trim()).catch((e) => toast.error(errorText(e)));
    toast.success(steamWebApiKey.trim() ? "Clave de Steam guardada" : "Clave de Steam eliminada");
  },
  setSteamId: async (steamId) => {
    set({ steamId: steamId.trim() });
    await api.setSetting("steamId", steamId.trim()).catch((e) => toast.error(errorText(e)));
  },
  setAutoBackupSaves: async (autoBackupSaves) => {
    set({ autoBackupSaves });
    await api.setSetting("autoBackupSaves", autoBackupSaves).catch((e) => toast.error(errorText(e)));
  },

  setQuickSearch: async (quickSearch) => {
    set({ quickSearch });
    const err = await applyHotkey(quickSearch.enabled, quickSearch.shortcut);
    if (err) {
      toast.error(`Atajo no válido u ocupado: ${err}`);
      return;
    }
    await api.setSetting("quickSearch", quickSearch).catch((e) => toast.error(errorText(e)));
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
