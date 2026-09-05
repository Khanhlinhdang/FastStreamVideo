/**
 * AUD-024 RBAC smoke: editor can catalog; admin-only disk/purge → 403 for editor.
 */
import { getDb, migrate, closeDb } from '../src/db/index.js';
import { config } from '../src/config.js';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';

async function login(app: Awaited<ReturnType<typeof buildApp>>, email: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`login ${email} -> ${res.statusCode} ${res.body}`);
  return (res.json() as { accessToken: string }).accessToken;
}

async function main() {
  const db = getDb();
  migrate(db);
  // Ensure editor
  const editorEmail = config.seedEditorEmail;
  const existing = db
    .prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`)
    .get(editorEmail) as { id: number } | undefined;
  if (!existing) {
    db.prepare(
      `INSERT INTO users (email, passwordHash, displayName, role) VALUES (?, ?, ?, 'editor')`,
    ).run(editorEmail, bcrypt.hashSync(config.seedEditorPassword, 10), config.seedEditorName);
  }

  const app = await buildApp();
  const editorTok = await login(app, editorEmail, config.seedEditorPassword);
  const adminTok = await login(app, config.seedAdminEmail, config.seedAdminPassword);

  const seriesEd = await app.inject({
    method: 'GET',
    url: '/api/admin/series',
    headers: { authorization: `Bearer ${editorTok}` },
  });
  if (seriesEd.statusCode !== 200) throw new Error(`editor series ${seriesEd.statusCode}`);

  const diskEd = await app.inject({
    method: 'GET',
    url: '/api/admin/disk-usage',
    headers: { authorization: `Bearer ${editorTok}` },
  });
  if (diskEd.statusCode !== 403) throw new Error(`editor disk expected 403 got ${diskEd.statusCode}`);

  const diskAd = await app.inject({
    method: 'GET',
    url: '/api/admin/disk-usage',
    headers: { authorization: `Bearer ${adminTok}` },
  });
  if (diskAd.statusCode !== 200) throw new Error(`admin disk ${diskAd.statusCode}`);

  const comments = await app.inject({
    method: 'GET',
    url: '/api/admin/comments/flagged',
    headers: { authorization: `Bearer ${editorTok}` },
  });
  if (comments.statusCode !== 200) throw new Error(`editor comments ${comments.statusCode}`);

  console.log('AUD-024 RBAC PASS', {
    editor: editorEmail,
    editorSeries: seriesEd.statusCode,
    editorDisk: diskEd.statusCode,
    adminDisk: diskAd.statusCode,
  });
  await app.close();
  closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
