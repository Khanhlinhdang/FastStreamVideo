/**
 * Re-encode seed demo episodes 1 & 5 with full ABR ladder (AUD-003).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { closeDb, getDb, migrate } from '../src/db/index.js';
import { encodeEpisodeHls } from '../src/services/encodeQueue.js';

async function fix(id: number) {
  const db = getDb();
  const ep = db.prepare(`SELECT id, sourcePath FROM episodes WHERE id = ?`).get(id) as
    | { id: number; sourcePath: string | null }
    | undefined;
  let src = ep?.sourcePath ?? '';
  if (!src || !fs.existsSync(src)) {
    src = path.join(config.uploadsDir, 'test-video-upload.mp4');
  }
  if (!fs.existsSync(src)) {
    src = path.join(config.mediaRoot, '..', 'test-video.mp4');
  }
  console.log(`[aud-003] encode ep=${id} src=${src}`);
  const hls = await encodeEpisodeHls(id, src, undefined, { maxDurationSec: 35 });
  db.prepare(
    `UPDATE episodes SET statusEncode = 'ready', hlsPath = ?, sourcePath = ?, updatedAt = datetime('now') WHERE id = ?`,
  ).run(hls, src, id);
  const master = fs.readFileSync(path.join(config.hlsDir, String(id), 'master.m3u8'), 'utf8');
  const n = (master.match(/#EXT-X-STREAM-INF/g) || []).length;
  console.log(`[aud-003] ep ${id} levels=${n}`);
  console.log(master);
  return n;
}

async function main() {
  migrate();
  const a = await fix(1);
  const b = await fix(5);
  closeDb();
  if (a >= 3 && b >= 3) {
    console.log('AUD-003 ENCODE PASS');
    process.exit(0);
  }
  console.log('AUD-003 ENCODE FAIL');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
