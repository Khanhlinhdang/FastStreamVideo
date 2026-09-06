import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { SCHEMA_SQL } from './schema.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function tableHasColumn(database: Database.Database, table: string, column: string): boolean {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

/** Additive migrations for existing SQLite DBs (CREATE IF NOT EXISTS is not enough for new columns). */
function applyAdditiveMigrations(database: Database.Database): void {
  if (!tableHasColumn(database, 'series', 'country')) {
    database.exec(`ALTER TABLE series ADD COLUMN country TEXT NOT NULL DEFAULT ''`);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS ratings (
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seriesId INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (userId, seriesId)
    );
    CREATE TABLE IF NOT EXISTS playback_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episodeId INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('rebuffer', 'error')),
      durationMs REAL,
      level INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_series_views ON series(viewCount DESC);
    CREATE INDEX IF NOT EXISTS idx_ratings_series ON ratings(seriesId);
    CREATE INDEX IF NOT EXISTS idx_playback_events_created ON playback_events(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_playback_events_episode ON playback_events(episodeId, createdAt DESC);

    CREATE TABLE IF NOT EXISTS episode_subtitles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episodeId INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Tiếng Việt',
      lang TEXT NOT NULL DEFAULT 'vi',
      path TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS view_dedup (
      viewerKey TEXT NOT NULL,
      episodeId INTEGER NOT NULL,
      viewedAt TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (viewerKey, episodeId)
    );
    CREATE INDEX IF NOT EXISTS idx_view_dedup_time ON view_dedup(viewedAt);

    CREATE TABLE IF NOT EXISTS episode_audio_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      episodeId INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT 'Audio phụ',
      lang TEXT NOT NULL DEFAULT 'und',
      sourcePath TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (!tableHasColumn(database, 'comments', 'hiddenAt')) {
    database.exec(`ALTER TABLE comments ADD COLUMN hiddenAt TEXT`);
  }
  if (!tableHasColumn(database, 'comments', 'flagCount')) {
    database.exec(`ALTER TABLE comments ADD COLUMN flagCount INTEGER NOT NULL DEFAULT 0`);
  }

  // SCL-009: local vs R2 HLS origin for playbackUrl
  if (!tableHasColumn(database, 'episodes', 'hlsStorage')) {
    database.exec(
      `ALTER TABLE episodes ADD COLUMN hlsStorage TEXT NOT NULL DEFAULT 'local'`,
    );
  }

  // COMP-001 / COMP-002: kind + rich metadata on series
  const seriesAddCols: Array<[string, string]> = [
    ['kind', `TEXT NOT NULL DEFAULT 'series'`],
    ['tagline', `TEXT NOT NULL DEFAULT ''`],
    ['runtimeSec', `INTEGER`],
    ['ageRating', `TEXT NOT NULL DEFAULT ''`],
    ['director', `TEXT NOT NULL DEFAULT ''`],
    ['castJson', `TEXT NOT NULL DEFAULT '[]'`],
    ['tagsJson', `TEXT NOT NULL DEFAULT '[]'`],
    ['trailerUrl', `TEXT`],
  ];
  for (const [col, decl] of seriesAddCols) {
    if (!tableHasColumn(database, 'series', col)) {
      database.exec(`ALTER TABLE series ADD COLUMN ${col} ${decl}`);
    }
  }
  database.exec(`CREATE INDEX IF NOT EXISTS idx_series_kind ON series(kind)`);

  // COMP-007: seasonNumber on episodes + unique (seriesId, season, number)
  if (!tableHasColumn(database, 'episodes', 'seasonNumber')) {
    database.exec(`ALTER TABLE episodes ADD COLUMN seasonNumber INTEGER NOT NULL DEFAULT 1`);
  }
  const epUniqueNeedsRebuild = (() => {
    const idx = database
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'episodes'`)
      .get() as { sql?: string } | undefined;
    const sql = idx?.sql ?? '';
    return sql.includes('UNIQUE(seriesId, number)') && !sql.includes('UNIQUE(seriesId, seasonNumber, number)');
  })();
  if (epUniqueNeedsRebuild) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS episodes_comp007 (
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
        deletedAt TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(seriesId, seasonNumber, number)
      );
      INSERT OR IGNORE INTO episodes_comp007 (
        id, seriesId, seasonNumber, number, title, durationSec, qualityLabel, audioLabel,
        statusEncode, hlsPath, hlsStorage, sourcePath, viewCount, deletedAt, createdAt, updatedAt
      )
      SELECT id, seriesId, COALESCE(seasonNumber, 1), number, title, durationSec, qualityLabel, audioLabel,
        statusEncode, hlsPath, COALESCE(hlsStorage, 'local'), sourcePath, viewCount, deletedAt, createdAt, updatedAt
      FROM episodes;
      DROP TABLE episodes;
      ALTER TABLE episodes_comp007 RENAME TO episodes;
      CREATE INDEX IF NOT EXISTS idx_episodes_series ON episodes(seriesId, seasonNumber, number);
    `);
    console.log('[migrate] episodes unique key updated for seasons');
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Rebuild users.role CHECK to include editor (AUD-024)
  const roleOk = (() => {
    try {
      database
        .prepare(
          `INSERT INTO users (email, passwordHash, displayName, role) VALUES ('__role_check_editor__', 'x', 'x', 'editor')`,
        )
        .run();
      database.prepare(`DELETE FROM users WHERE email = '__role_check_editor__'`).run();
      return true;
    } catch {
      return false;
    }
  })();
  if (!roleOk) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS users_aud024 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        passwordHash TEXT NOT NULL,
        displayName TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'admin', 'editor')) DEFAULT 'user',
        avatarUrl TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO users_aud024 (id, email, passwordHash, displayName, role, avatarUrl, createdAt)
        SELECT id, email, passwordHash, displayName, role, avatarUrl, createdAt FROM users;
      DROP TABLE users;
      ALTER TABLE users_aud024 RENAME TO users;
    `);
    console.log('[migrate] users.role CHECK updated for editor');
  }
}
export function migrate(database: Database.Database = getDb()): void {
  database.exec(SCHEMA_SQL);
  applyAdditiveMigrations(database);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
