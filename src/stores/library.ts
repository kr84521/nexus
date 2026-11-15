import { create } from "zustand";
import { api, errorText } from "@/lib/api";
import { displayTitle } from "@/lib/art";
import type { Collection, Game, Store } from "@/types";
import { toast } from "./toast";

export type Filter =
  | { type: "all" }
  | { type: "favorites" }
  | { type: "recent" }
  | { type: "hidden" }
  | { type: "store"; store: Store }
  | { type: "collection"; id: string };

export type SortKey = "title" | "lastPlayed" | "added" | "playCount";
export type Page = "library" | "settings";

interface LibraryState {
  games: Game[];
  collections: Collection[];
  loaded: boolean;
  scanning: boolean;
  fetchingArt: boolean;
  filter: Filter;
  search: string;
  sort: SortKey;
  page: Page;
  selectedId: string | null;
  hoveredId: string | null;

  load: () => Promise<void>;
  scan: (silent?: boolean) => Promise<void>;
  upsert: (game: Game) => void;
  refreshGame: (id: string) => Promise<void>;
  setFilter: (f: Filter) => void;
  setSearch: (s: string) => void;
  setSort: (s: SortKey) => void;
  setPage: (p: Page) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setFetchingArt: (v: boolean) => void;

  launch: (id: string, sourceId?: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  toggleHidden: (id: string) => Promise<void>;
  removeGame: (id: string) => Promise<void>;

  createCollection: (name: string) => Promise<Collection | null>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  toggleInCollection: (collectionId: string, gameId: string) => Promise<void>;
}

/** Ejecuta una mutación que devuelve el juego actualizado y lo guarda; muestra error si falla. */
async function mutate(fn: () => Promise<Game>, upsert: (g: Game) => void) {
  try {
    upsert(await fn());
  } catch (e) {
    toast.error(errorText(e));
  }
}

export const useLibrary = create<LibraryState>((set, get) => ({
  games: [],
  collections: [],
  loaded: false,
  scanning: false,
  fetchingArt: false,
  filter: { type: "all" },
  search: "",
  sort: "title",
  page: "library",
  selectedId: null,
  hoveredId: null,

  load: async () => {
    try {
      const { games, collections } = await api.getLibrary();
      set({ games, collections, loaded: true });
    } catch (e) {
      toast.error(errorText(e));
      set({ loaded: true });
    }
  },

  scan: async (silent = false) => {
    if (get().scanning) return;
    set({ scanning: true, fetchingArt: true });
    try {
      const report = await api.scanLibrary();
      await get().load();
      if (!silent) {
        const parts = [`${report.total} juegos detectados`];
        if (report.added) parts.push(`${report.added} nuevos`);
        if (report.removed) parts.push(`${report.removed} eliminados`);
        toast.success(parts.join(" · "));
      }
      report.errors.forEach((e) => toast.error(e));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      set({ scanning: false });
    }
  },

  upsert: (game) =>
    set((s) => {
      const i = s.games.findIndex((g) => g.id === game.id);
      if (i === -1) return { games: [...s.games, game] };
      const games = s.games.slice();
      games[i] = game;
      return { games };
    }),

  refreshGame: async (id) => {
    // Recarga solo un juego (tras eventos de arte). Usa la biblioteca completa: barato con SQLite local.
    try {
      const { games } = await api.getLibrary();
      const g = games.find((x) => x.id === id);
      if (g) get().upsert(g);
    } catch {
      /* silencioso */
    }
  },

  setFilter: (filter) => set({ filter, page: "library", selectedId: null }),
  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),
  setPage: (page) => set({ page, selectedId: null }),
  select: (selectedId) => set({ selectedId }),
  hover: (hoveredId) => set({ hoveredId }),
  setFetchingArt: (fetchingArt) => set({ fetchingArt }),

  launch: async (id, sourceId) => {
    const g = get().games.find((x) => x.id === id);
    if (g) toast.info(`Iniciando ${displayTitle(g)}…`);
    await mutate(() => api.launchGame(id, sourceId), get().upsert);
  },
  toggleFavorite: async (id) => {
    const g = get().games.find((x) => x.id === id);
    if (g) await mutate(() => api.setFavorite(id, !g.favorite), get().upsert);
  },
  toggleHidden: async (id) => {
    const g = get().games.find((x) => x.id === id);
    if (g) await mutate(() => api.setHidden(id, !g.hidden), get().upsert);
  },
  removeGame: async (id) => {
    try {
      await api.removeGame(id);
      set((s) => ({ games: s.games.filter((g) => g.id !== id), selectedId: null }));
    } catch (e) {
      toast.error(errorText(e));
    }
  },

  createCollection: async (name) => {
    try {
      const c = await api.createCollection(name);
      set((s) => ({ collections: [...s.collections, c] }));
      return c;
    } catch (e) {
      toast.error(errorText(e));
      return null;
    }
  },
  renameCollection: async (id, name) => {
    try {
      await api.renameCollection(id, name);
      set((s) => ({ collections: s.collections.map((c) => (c.id === id ? { ...c, name } : c)) }));
    } catch (e) {
      toast.error(errorText(e));
    }
  },
  deleteCollection: async (id) => {
    try {
      await api.deleteCollection(id);
      set((s) => ({
        collections: s.collections.filter((c) => c.id !== id),
        games: s.games.map((g) => ({ ...g, collections: g.collections.filter((c) => c !== id) })),
        filter: s.filter.type === "collection" && s.filter.id === id ? { type: "all" } : s.filter,
      }));
    } catch (e) {
      toast.error(errorText(e));
    }
  },
  toggleInCollection: async (collectionId, gameId) => {
    const g = get().games.find((x) => x.id === gameId);
    if (!g) return;
    const member = !g.collections.includes(collectionId);
    await mutate(() => api.setInCollection(collectionId, gameId, member), get().upsert);
  },
}));

/** Juegos visibles según filtro, búsqueda y orden. */
export function selectVisible(s: LibraryState): Game[] {
  const q = s.search.trim().toLowerCase();
  let list = s.games.filter((g) => {
    if (s.filter.type === "hidden") {
      if (!g.hidden) return false;
    } else if (g.hidden) return false;
    switch (s.filter.type) {
      case "favorites":
        if (!g.favorite) return false;
        break;
      case "recent":
        if (!g.lastPlayed) return false;
        break;
      case "store": {
        const store = s.filter.store;
        if (!g.sources.some((src) => src.store === store)) return false;
        break;
      }
      case "collection":
        if (!g.collections.includes(s.filter.id)) return false;
        break;
    }
    return !q || displayTitle(g).toLowerCase().includes(q);
  });

  const byTitle = (a: Game, b: Game) => displayTitle(a).localeCompare(displayTitle(b), "es", { sensitivity: "base" });
  const sort = s.filter.type === "recent" ? "lastPlayed" : s.sort;
  list = list.slice().sort((a, b) => {
    switch (sort) {
      case "lastPlayed":
        return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || byTitle(a, b);
      case "added":
        return b.addedAt - a.addedAt || byTitle(a, b);
      case "playCount":
        return b.playCount - a.playCount || byTitle(a, b);
      default:
        return byTitle(a, b);
    }
  });
  return list;
}
