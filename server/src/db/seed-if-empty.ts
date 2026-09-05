import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { getDb, migrate, closeDb } from './index.js';
import { seed } from './seed-data.js';
import { config } from '../config.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.hlsDir, { recursive: true });
fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = getDb();
migrate(db);

const row = db.prepare(`SELECT COUNT(*) AS c FROM users`).get() as { c: number };
if (row.c === 0) {
  console.log('[seed-if-empty] no users — running seed...');
  seed(db);
} else {
  console.log(`[seed-if-empty] skip (users=${row.c})`);
  // Ensure editor exists for AUD-024 without full reset
  const editor = db
    .prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`)
    .get(config.seedEditorEmail) as { id: number } | undefined;
  if (!editor) {
    db.prepare(
      `INSERT INTO users (email, passwordHash, displayName, role) VALUES (?, ?, ?, 'editor')`,
    ).run(
      config.seedEditorEmail,
      bcrypt.hashSync(config.seedEditorPassword, 10),
      config.seedEditorName,
    );
    console.log(`[seed-if-empty] created editor ${config.seedEditorEmail}`);
  }
}

closeDb();
