PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
    id               TEXT PRIMARY KEY,       -- "g:<titulo-normalizado>" o "m:<uuid>" para manuales
    title            TEXT NOT NULL,
    custom_title     TEXT,
    favorite         INTEGER NOT NULL DEFAULT 0,
    hidden           INTEGER NOT NULL DEFAULT 0,
    last_played      INTEGER,
    play_count       INTEGER NOT NULL DEFAULT 0,
    added_at         INTEGER NOT NULL,
    preferred_source TEXT,
    sgdb_id          INTEGER,
    art_cover        TEXT,
    art_hero         TEXT,
    art_logo         TEXT,
    art_icon         TEXT,
    art_version      INTEGER NOT NULL DEFAULT 0,
    art_fetched      INTEGER NOT NULL DEFAULT 0, -- 1 = ya se intentó la descarga automática
    playtime_secs    INTEGER NOT NULL DEFAULT 0,
    art_color        TEXT,
    meta_fetched     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS metadata (
    game_id        TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
    steam_appid    TEXT,
    description    TEXT,
    genres         TEXT NOT NULL DEFAULT '[]',  -- JSON
    release_year   INTEGER,
    developer      TEXT,
    publisher      TEXT,
    trailer_url    TEXT,
    trailer_poster TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    secs       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_game ON sessions(game_id);

CREATE TABLE IF NOT EXISTS sources (
    id           TEXT PRIMARY KEY,           -- "<store>:<store_id>"
    game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    store        TEXT NOT NULL,
    store_id     TEXT NOT NULL,
    title        TEXT NOT NULL,
    install_path TEXT,
    launch       TEXT NOT NULL               -- JSON de LaunchTarget
);
CREATE INDEX IF NOT EXISTS idx_sources_game ON sources(game_id);

CREATE TABLE IF NOT EXISTS collections (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS collection_games (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, game_id)
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                      -- JSON
);
