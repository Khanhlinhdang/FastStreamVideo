export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  passwordHash TEXT NOT NULL,
  displayName TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'admin', 'editor')) DEFAULT 'user',
  avatarUrl TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  synopsis TEXT NOT NULL DEFAULT '',
  posterUrl TEXT,
  status TEXT NOT NULL CHECK(status IN ('ongoing', 'completed')) DEFAULT 'ongoing',
  kind TEXT NOT NULL CHECK(kind IN ('movie', 'series')) DEFAULT 'series',
  year INTEGER,
  country TEXT NOT NULL DEFAULT '',
  viewCount INTEGER NOT NULL DEFAULT 0,
  qualityLabel TEXT DEFAULT '1080p',
  audioLabel TEXT DEFAULT 'SUB+TM',
  isHot INTEGER NOT NULL DEFAULT 0,
  rankingScore INTEGER NOT NULL DEFAULT 0,
  tagline TEXT NOT NULL DEFAULT '',
  runtimeSec INTEGER,
  ageRating TEXT NOT NULL DEFAULT '',
  director TEXT NOT NULL DEFAULT '',
  castJson TEXT NOT NULL DEFAULT '[]',
  tagsJson TEXT NOT NULL DEFAULT '[]',
  trailerUrl TEXT,
  deletedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS series_genres (
  seriesId INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  genreId INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (seriesId, genreId)
);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seriesId INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  seasonNumber INTEGER NOT NULL DEFAULT 1,
  number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  durationSec INTEGER NOT NULL DEFAULT 0,
  qualityLabel TEXT DEFAULT '1080p',
  audioLabel TEXT DEFAULT 'SUB+TM',
  statusEncode TEXT NOT NULL CHECK(statusEncode IN ('none', 'queued', 'encoding', 'ready', 'failed')) DEFAULT 'none',
  hlsPath TEXT,
  hlsStorage TEXT NOT NULL DEFAULT 'local' CHECK(hlsStorage IN ('local', 'r2')),
  sourcePath TEXT,
  viewCount INTEGER NOT NULL DEFAULT 0,
  introEndSec INTEGER,
  creditsStartSec INTEGER,
  deletedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(seriesId, seasonNumber, number)
);

CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seriesId INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  note TEXT DEFAULT '',
  deletedAt TEXT
);

CREATE TABLE IF NOT EXISTS favorites (
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seriesId INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (userId, seriesId)
);

CREATE TABLE IF NOT EXISTS watch_history (
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episodeId INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  positionSec REAL NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (userId, episodeId)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  episodeId INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  deletedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ratings (
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seriesId INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (userId, seriesId)
);

CREATE TABLE IF NOT EXISTS encode_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episodeId INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('queued', 'encoding', 'ready', 'failed')) DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  error TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  finishedAt TEXT
);

CREATE TABLE IF NOT EXISTS episode_subtitles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episodeId INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Tiếng Việt',
  lang TEXT NOT NULL DEFAULT 'vi',
  path TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS episode_audio_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episodeId INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Audio phụ',
  lang TEXT NOT NULL DEFAULT 'und',
  sourcePath TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playback_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  episodeId INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('rebuffer', 'error')),
  durationMs REAL,
  level INTEGER,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tokenHash TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  usedAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_series_status ON series(status);
CREATE INDEX IF NOT EXISTS idx_series_updated ON series(updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_series_ranking ON series(rankingScore DESC);
CREATE INDEX IF NOT EXISTS idx_series_views ON series(viewCount DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(seriesId, number);
CREATE INDEX IF NOT EXISTS idx_schedule_weekday ON schedule(weekday);
CREATE INDEX IF NOT EXISTS idx_comments_episode ON comments(episodeId);
CREATE INDEX IF NOT EXISTS idx_encode_jobs_status ON encode_jobs(status);
CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(userId, updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_series ON ratings(seriesId);
`;
