/**
 * SCL scaling smoke: Cache-Control, ladder policy, R2 mock publish, playbackUrl.
 * Run: npx tsx server/scripts/scl-scaling-smoke.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { config, REPO_ROOT, refreshRuntimeFlagsFromEnv } from '../src/config.js';
import { closeDb, getDb, migrate } from '../src/db/index.js';
import { mapEpisode, type EpisodeRow } from '../src/lib/mappers.js';
import { resetR2ClientForTests } from '../src/lib/r2.js';
import { selectLadderForTitle } from '../src/services/encodeQueue.js';
import { listHlsFilesForPublish, publishEpisodeHlsToR2 } from '../src/services/r2HlsPublish.js';
import { cleanupLocalHlsAfterR2 } from '../src/services/hlsCleanup.js';

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

function assert(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
}

async function main() {
  const caddy = fs.readFileSync(path.join(REPO_ROOT, 'deploy/Caddyfile'), 'utf8');
  assert(
    'SCL-001 Caddyfile HLS bypass',
    caddy.includes('handle_path /media/hls/*') && caddy.includes('file_server'),
    'handle_path /media/hls/* + file_server present',
  );
  assert(
    'SCL-001 Caddyfile immutable segments',
    caddy.includes('max-age=31536000, immutable') && caddy.includes('max-age=60'),
    'segment immutable + playlist max-age=60',
  );

  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  assert('health ok', health.ok === true, JSON.stringify(health));

  const playlist = await fetch(`${base}/media/hls/1/master.m3u8`);
  const plCc = playlist.headers.get('cache-control') ?? '';
  assert(
    'SCL-001 playlist Cache-Control',
    playlist.ok && /max-age=60/.test(plCc),
    `status=${playlist.status} cc=${plCc}`,
  );

  const seg = await fetch(`${base}/media/hls/1/0/seg_000.m4s`, { method: 'HEAD' });
  const segCc = seg.headers.get('cache-control') ?? '';
  assert(
    'SCL-001 segment Cache-Control',
    seg.ok && /31536000/.test(segCc) && /immutable/i.test(segCc),
    `status=${seg.status} cc=${segCc}`,
  );

  const init = await fetch(`${base}/media/hls/1/0/init_0.mp4`, { method: 'HEAD' });
  const initCc = init.headers.get('cache-control') ?? '';
  assert(
    'SCL-001 init Cache-Control',
    init.ok && /immutable/i.test(initCc),
    `status=${init.status} cc=${initCc}`,
  );

  const full = selectLadderForTitle({ width: 1920, height: 1080, bitRate: 8_000_000 });
  assert(
    'SCL-006 default ladder includes <=1080',
    full.some((r) => r.height === 1080) && full.every((r) => r.height <= config.maxEncodeHeight),
    `heights=${full.map((r) => r.height).join(',')}`,
  );
  assert(
    'SCL-006 tightened 720 maxrate <=2500k',
    Number.parseInt(full.find((r) => r.height === 720)?.maxrate ?? '9999', 10) <= 2500,
    `720 maxrate=${full.find((r) => r.height === 720)?.maxrate}`,
  );

  process.env.MAX_ENCODE_HEIGHT = '720';
  refreshRuntimeFlagsFromEnv();
  const capped = selectLadderForTitle({ width: 1920, height: 1080, bitRate: 8_000_000 });
  assert(
    'SCL-006 MAX_ENCODE_HEIGHT=720',
    capped.every((r) => r.height <= 720) && !capped.some((r) => r.height === 1080),
    `heights=${capped.map((r) => r.height).join(',')}`,
  );
  delete process.env.MAX_ENCODE_HEIGHT;
  refreshRuntimeFlagsFromEnv();

  assert(
    'SCL-007 health exposes r2',
    typeof health.r2 === 'boolean' && typeof health.r2PublishMode === 'string',
    `r2=${health.r2} mode=${health.r2PublishMode}`,
  );

  const files = listHlsFilesForPublish(1);
  assert(
    'SCL-008 local HLS tree listable',
    files.includes('master.m3u8') && files.some((f) => f.endsWith('.m4s')),
    `count=${files.length}`,
  );

  const mockRoot = path.join(REPO_ROOT, 'data', 'r2-mock-scl');
  fs.rmSync(mockRoot, { recursive: true, force: true });
  process.env.R2_MOCK_DIR = mockRoot;
  process.env.R2_PUBLIC_BASE_URL = 'https://media.test.local';
  process.env.R2_PUBLISH_MODE = 'all';
  refreshRuntimeFlagsFromEnv();
  resetR2ClientForTests();

  const pub = await publishEpisodeHlsToR2(1, { force: true });
  assert(
    'SCL-008 mock R2 publish',
    pub.ok === true &&
      (pub.uploaded ?? 0) > 0 &&
      fs.existsSync(path.join(mockRoot, 'hls/1/master.m3u8')),
    JSON.stringify({ ok: pub.ok, uploaded: pub.uploaded, err: pub.error }),
  );
  assert(
    'SCL-008 segment on mock R2',
    fs.existsSync(path.join(mockRoot, 'hls/1/0/seg_000.m4s')),
    'seg_000.m4s present',
  );

  migrate(getDb());
  const localEp: EpisodeRow = {
    id: 1,
    seriesId: 1,
    number: 1,
    title: 't',
    durationSec: 10,
    qualityLabel: '1080p',
    audioLabel: null,
    statusEncode: 'ready',
    hlsPath: 'hls/1/master.m3u8',
    hlsStorage: 'local',
    viewCount: 0,
    updatedAt: new Date().toISOString(),
  };
  const localMapped = mapEpisode(localEp);
  assert(
    'SCL-009 local playbackUrl',
    localMapped.playbackUrl === '/media/hls/1/master.m3u8',
    String(localMapped.playbackUrl),
  );

  const r2Mapped = mapEpisode({ ...localEp, hlsStorage: 'r2' });
  assert(
    'SCL-009 r2 playbackUrl absolute',
    r2Mapped.playbackUrl === 'https://media.test.local/hls/1/master.m3u8',
    String(r2Mapped.playbackUrl),
  );

  const cleanup = await cleanupLocalHlsAfterR2({ dryRun: true, minAgeHours: 0 });
  assert(
    'SCL-010 cleanup dry-run',
    cleanup.dryRun === true && Array.isArray(cleanup.candidates),
    `candidates=${cleanup.candidates.length} freedBytes=${cleanup.freedBytes}`,
  );

  delete process.env.R2_MOCK_DIR;
  delete process.env.R2_PUBLIC_BASE_URL;
  delete process.env.R2_PUBLISH_MODE;
  refreshRuntimeFlagsFromEnv();
  resetR2ClientForTests();

  await app.close();
  closeDb();

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
