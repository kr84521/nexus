// Espejo de src-tauri/src/models.rs. Mantener sincronizado.

export type Store = "steam" | "epic" | "gog" | "ea" | "ubisoft" | "battlenet" | "xbox" | "manual";

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
