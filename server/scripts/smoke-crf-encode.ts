/**
 * One-off CRF ladder smoke test (short clip).
 * Usage: npx tsx server/scripts/smoke-crf-encode.ts [episodeId] [maxDurationSec]
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, REPO_ROOT } from '../src/config.js';
import { closeDb, getDb } from '../src/db/index.js';
import { encodeEpisodeHls } from '../src/services/encodeQueue.js';

async function main() {
  const episodeId = Number(process.argv[2] ?? 40);
  const maxDurationSec = Number(process.argv[3] ?? 25);
  const db = getDb();
  const ep = db
    .prepare(`SELECT id, sourcePath FROM episodes WHERE id = ?`)
    .get(episodeId) as { id: number; sourcePath: string | null } | undefined;

  let src =
    ep?.sourcePath ||
    path.join(config.uploadsDir, 'test-video-upload.mp4');
  if (!fs.existsSync(src)) {
    src = path.join(REPO_ROOT, 'test-video.mp4');
  }
  if (!fs.existsSync(src)) {
    console.error('No source');
    process.exit(2);
  }

  console.log(`[smoke-crf] episode=${episodeId} duration=${maxDurationSec}s src=${src}`);
  const hlsPath = await encodeEpisodeHls(
    episodeId,
    src,
    (p) => console.log(`[smoke-crf] progress ${p}`),
    { maxDurationSec },
  );
  const master = fs.readFileSync(path.join(config.hlsDir, String(episodeId), 'master.m3u8'), 'utf8');
  console.log('--- master ---');
  console.log(master);
  console.log('hlsPath', hlsPath);

  const variant0 = path.join(config.hlsDir, String(episodeId), '0');
  const initOk =
    fs.existsSync(path.join(variant0, 'init_0.mp4')) ||
    fs.existsSync(path.join(variant0, 'init.mp4'));
  console.log('init_ok', initOk);

  let bytes = 0;
  for (const f of fs.readdirSync(path.join(config.hlsDir, String(episodeId)), { recursive: true })) {
    const full = path.join(config.hlsDir, String(episodeId), String(f));
    if (fs.statSync(full).isFile()) bytes += fs.statSync(full).size;
  }
  console.log('size_bytes', bytes);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
