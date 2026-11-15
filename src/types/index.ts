// Espejo de src-tauri/src/models.rs. Mantener sincronizado.

export type Store = "steam" | "epic" | "gog" | "ea" | "ubisoft" | "battlenet" | "xbox" | "rom" | "manual";

export type LaunchTarget =
  | { kind: "uri"; uri: string }
  | { kind: "exe"; path: string; args: string[]; cwd?: string | null };

export interface GameSource {
  id: string;
  store: Store;
  storeId: string;
  title: string;
  installPath: string | null;
  launch: LaunchTarget;
}

export interface Artwork {
  cover: string | null;
  hero: string | null;
  logo: string | null;
  icon: string | null;
}

export interface Game {
  id: string;
  title: string;
  customTitle: string | null;
  favorite: boolean;
  hidden: boolean;
  lastPlayed: number | null;
  playCount: number;
  addedAt: number;
  preferredSource: string | null;
  sgdbId: number | null;
  artwork: Artwork;
  artworkVersion: number;
  playtimeSecs: number;
  artColor: string | null;
  meta: Metadata | null;
  launchOptions: LaunchOptions;
  sources: GameSource[];
  collections: string[];
}

export interface Metadata {
  steamAppid: string | null;
  description: string | null;
  genres: string[];
  releaseYear: number | null;
  developer: string | null;
  publisher: string | null;
  trailerUrl: string | null;
  trailerPoster: string | null;
}

export interface LaunchOptions {
  args: string;
  preCommand: string;
  postCommand: string;
  closeStoreOnExit: boolean;
  runAsAdmin: boolean;
}

export interface StatsReport {
  totalSecs: number;
  weekSecs: number;
  monthSecs: number;
  sessionsCount: number;
  gamesPlayed: number;
  streakDays: number;
  days: { day: string; secs: number }[];
  topAllTime: { gameId: string; title: string; secs: number; sessions: number }[];
  topMonth: { gameId: string; title: string; secs: number; sessions: number }[];
  recent: { gameId: string; title: string; startedAt: number; secs: number }[];
}

export interface SaveBackup {
  name: string;
  createdAt: number;
  files: number;
  bytes: number;
  path: string;
}

export interface SaveInfo {
  paths: string[];
  backups: SaveBackup[];
  destination: string;
}

export interface Screenshot {
  path: string;
  modified: number;
  source: string;
}

export interface NewsItem {
  title: string;
  url: string;
  feed: string;
  date: number;
  excerpt: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  iconGray: string;
  hidden: boolean;
  unlocked: boolean;
  unlockTime: number | null;
  percent: number | null;
}

export interface AchievementsReport {
  total: number;
  unlocked: number;
  items: Achievement[];
}

export interface Collection {
  id: string;
  name: string;
  sort: number;
}

export interface ScanReport {
  total: number;
  added: number;
  removed: number;
  perStore: [Store, number][];
  errors: string[];
}

export type ArtKind = "cover" | "hero" | "logo" | "icon";

export interface ArtOption {
  id: number;
  url: string;
  thumb: string;
  width: number;
  height: number;
  style: string | null;
  author: string | null;
}

export interface SgdbGame {
  id: number;
  name: string;
  releaseDate: number | null;
}
