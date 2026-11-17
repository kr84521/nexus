// Wrappers tipados de los comandos de Tauri. El nombre de cada función = nombre del comando en Rust.
// Tauri convierte los argumentos camelCase de JS a snake_case en Rust automáticamente.
import { invoke } from "@tauri-apps/api/core";
import type {
  AchievementsReport,
  ArtKind,
  ArtOption,
  Collection,
  Game,
  GameStatus,
  LaunchOptions,
  MergeSuggestion,
  NewsItem,
  OwnedGame,
  SaveBackup,
  SaveInfo,
  ScanReport,
  Screenshot,
  SteamAccount,
  SgdbGame,
  StatsReport,
} from "@/types";

export const api = {
  getLibrary: () => invoke<{ games: Game[]; collections: Collection[] }>("get_library"),
  scanLibrary: () => invoke<ScanReport>("scan_library"),
  launchGame: (id: string, sourceId?: string) => invoke<Game>("launch_game", { id, sourceId }),
  setLaunchOptions: (id: string, options: LaunchOptions) => invoke<Game>("set_launch_options", { id, options }),
  setStatus: (id: string, status: GameStatus) => invoke<Game>("set_status", { id, status }),
  setRating: (id: string, rating: number) => invoke<Game>("set_rating", { id, rating }),
  setNotes: (id: string, notes: string) => invoke<Game>("set_notes", { id, notes }),
  syncSteam: () => invoke<{ owned: number; updated: number; hours: number }>("sync_steam"),
  steamOwnedNotInstalled: () => invoke<OwnedGame[]>("steam_owned_not_installed"),
  mergeSuggestions: () => invoke<MergeSuggestion[]>("merge_suggestions"),
  getStats: () => invoke<StatsReport>("get_stats"),
  setFavorite: (id: string, value: boolean) => invoke<Game>("set_favorite", { id, value }),
  setHidden: (id: string, value: boolean) => invoke<Game>("set_hidden", { id, value }),
  setCustomTitle: (id: string, title: string | null) => invoke<Game>("set_custom_title", { id, title }),
  setPreferredSource: (id: string, sourceId: string | null) =>
    invoke<Game>("set_preferred_source", { id, sourceId }),
  openInstallFolder: (id: string) => invoke<void>("open_install_folder", { id }),
  addManualGame: (title: string, exe: string) => invoke<Game>("add_manual_game", { title, exe }),
  removeGame: (id: string) => invoke<void>("remove_game", { id }),
  mergeGames: (into: string, from: string) => invoke<Game>("merge_games", { into, from }),
  splitSource: (sourceId: string) => invoke<Game>("split_source", { sourceId }),

  createCollection: (name: string) => invoke<Collection>("create_collection", { name }),
  renameCollection: (id: string, name: string) => invoke<void>("rename_collection", { id, name }),
  deleteCollection: (id: string) => invoke<void>("delete_collection", { id }),
  setInCollection: (collectionId: string, gameId: string, member: boolean) =>
    invoke<Game>("set_in_collection", { collectionId, gameId, member }),

  artOptions: (gameId: string, kind: ArtKind) => invoke<ArtOption[]>("art_options", { gameId, kind }),
  setArtFromUrl: (gameId: string, kind: ArtKind, url: string) =>
    invoke<Game>("set_art_from_url", { gameId, kind, url }),
  setArtFromFile: (gameId: string, kind: ArtKind, path: string) =>
    invoke<Game>("set_art_from_file", { gameId, kind, path }),
  clearArt: (gameId: string, kind: ArtKind) => invoke<Game>("clear_art", { gameId, kind }),
  sgdbSearch: (term: string) => invoke<SgdbGame[]>("sgdb_search", { term }),
  setSgdbGame: (gameId: string, sgdbId: number) => invoke<Game>("set_sgdb_game", { gameId, sgdbId }),
  refetchMissingArt: () => invoke<void>("refetch_missing_art"),
  refetchMissingMetadata: () => invoke<void>("refetch_missing_metadata"),

  getSettings: () => invoke<Record<string, unknown>>("get_settings"),
  setBackgroundImage: (path: string) => invoke<string>("set_background_image", { path }),
  writeTextFile: (path: string, content: string) => invoke<void>("write_text_file", { path, content }),
  readTextFile: (path: string) => invoke<string>("read_text_file", { path }),
  exportLibrary: (dir: string) => invoke<number>("export_library", { dir }),
  savesInfo: (gameId: string) => invoke<SaveInfo>("saves_info", { gameId }),
  backupSaves: (gameId: string) => invoke<SaveBackup>("backup_saves", { gameId }),
  restoreSaves: (gameId: string, name: string) => invoke<number>("restore_saves", { gameId, name }),
  openPath: (path: string) => invoke<void>("open_path", { path }),
  gameScreenshots: (gameId: string) => invoke<Screenshot[]>("game_screenshots", { gameId }),
  gameNews: (gameId: string) => invoke<NewsItem[]>("game_news", { gameId }),
  gameAchievements: (gameId: string) => invoke<AchievementsReport>("game_achievements", { gameId }),
  detectedSteamId: () => invoke<string | null>("detected_steam_id"),
  steamAccounts: () => invoke<SteamAccount[]>("steam_accounts"),
  notifyWhenHidden: (title: string, body: string) => invoke<void>("notify_when_hidden", { title, body }),
  importLibrary: (dir: string) =>
    invoke<{ games: number; collections: number; sessions: number; artworkFiles: number }>("import_library", { dir }),
  setSetting: (key: string, value: unknown) => invoke<void>("set_setting", { key, value }),
};

export function errorText(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
}
