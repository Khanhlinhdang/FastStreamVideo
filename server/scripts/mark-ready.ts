import { closeDb, getDb } from '../src/db/index.js';

const ids = process.argv.slice(2).map(Number).filter((n) => Number.isFinite(n) && n > 0);
const db = getDb();
for (const id of ids.length ? ids : [39, 40]) {
  db.prepare(
    `UPDATE episodes SET statusEncode = 'ready', hlsPath = ?, updatedAt = datetime('now') WHERE id = ?`,
  ).run(`hls/${id}/master.m3u8`, id);
  console.log('marked ready', id);
}
closeDb();
