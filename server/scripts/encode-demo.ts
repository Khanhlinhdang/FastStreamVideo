/**
 * Prepare demo HLS for seed episodes.
 *
 * Prefer short open-movie trailers; falls back to repo-root `test-video.mp4` when present.
 * Set DEMO_FULL=1 for full 480/720/1080 ladder (slower). Default is fast (480p) for local bootstrap.
 *
 * Requires ffmpeg (PATH or bundled @ffmpeg-installer).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config, REPO_ROOT } from '../src/config.js';
import { getDb, migrate, closeDb } from '../src/db/index.js';
import { seed } from '../src/db/seed-data.js';
import { encodeEpisodeHls } from '../src/services/encodeQueue.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const fast = process.env.DEMO_FULL !== '1';

function checkBin(bin: string): boolean {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0;
}

async function ensureDownloads(): Promise<Record<string, string>> {
  const localTest = path.join(REPO_ROOT, 'test-video.mp4');
  const demoDir = path.join(config.uploadsDir, 'demo');
  const manifestPath = path.join(demoDir, 'manifest.json');

  // Prefer short trailers from download script
  if (!fs.existsSync(manifestPath)) {
    console.log('[encode-demo] downloading demo sources…');
    const r = spawnSync('npx', ['tsx', 'scripts/download-demo.ts'], {
      cwd: serverRoot,
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    if (r.status !== 0) {
      if (fs.existsSync(localTest)) {
        console.warn('[encode-demo] download failed; using local test-video.mp4');
        return { 'big-buck-bunny': localTest, sintel: localTest };
      }
      throw new Error('download-demo failed and no local test-video.mp4');
    }
  }

  const paths = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, string>;
  if (fs.existsSync(localTest)) {
    // Keep downloads for sintel; optionally override BBB with local file for faster encode
    if (!paths['big-buck-bunny'] || !fs.existsSync(paths['big-buck-bunny'])) {
      paths['big-buck-bunny'] = localTest;
    }
  }
  return paths;
}

async function main() {
  console.log(`[encode-demo] ffmpeg=${config.ffmpegPath}`);
  console.log(`[encode-demo] ffprobe=${config.ffprobePath}`);
  console.log(`[encode-demo] mode=${fast ? 'fast (480p)' : 'full ladder'}`);

  if (!checkBin(config.ffmpegPath) || !checkBin(config.ffprobePath)) {
    console.error('ERROR: ffmpeg/ffprobe not runnable');
    process.exit(1);
  }

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.hlsDir, { recursive: true });

  const paths = await ensureDownloads();
  const db = getDb();
  migrate(db);
  seed(db, { markDemoReady: false });

  const targets: { key: string; seriesSlug: string }[] = [
    { key: 'big-buck-bunny', seriesSlug: 'neon-harbor-chronicles' },
    { key: 'sintel', seriesSlug: 'skyforge-academy' },
  ];

  for (const t of targets) {
    const input = paths[t.key];
    if (!input || !fs.existsSync(input)) {
      console.warn(`[encode-demo] missing source for ${t.key}`);
      continue;
    }
    const ep = db
      .prepare(
        `
        SELECT e.id FROM episodes e
        JOIN series s ON s.id = e.seriesId
        WHERE s.slug = ? AND e.number = 1
      `,
      )
      .get(t.seriesSlug) as { id: number } | undefined;
    if (!ep) {
      console.warn(`[encode-demo] episode not found for ${t.seriesSlug}`);
      continue;
    }

    console.log(`[encode-demo] encoding ${t.key} → episode ${ep.id} (${path.basename(input)})…`);
    db.prepare(`UPDATE episodes SET sourcePath = ?, statusEncode = 'encoding' WHERE id = ?`).run(
      input,
      ep.id,
    );
    try {
      const hlsPath = await encodeEpisodeHls(
        ep.id,
        input,
        (p) => {
          process.stdout.write(`\r[encode-demo] ${t.key} ${Math.round(p)}%   `);
        },
        { fast, maxDurationSec: fast ? 45 : undefined },
      );
      console.log(`\n[encode-demo] ready: /media/${hlsPath}`);
      db.prepare(
        `UPDATE episodes SET statusEncode = 'ready', hlsPath = ?, updatedAt = datetime('now') WHERE id = ?`,
      ).run(hlsPath, ep.id);
    } catch (err) {
      console.error(`[encode-demo] failed ${t.key}`, err);
      db.prepare(`UPDATE episodes SET statusEncode = 'failed' WHERE id = ?`).run(ep.id);
    }
  }

  closeDb();
  console.log('[encode-demo] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
