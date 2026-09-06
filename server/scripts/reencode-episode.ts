/**
 * Re-encode specific episode HLS while keeping DB rows.
 * Usage: npx tsx scripts/reencode-episode.ts <episodeId> [sourcePath]
 * If sourcePath omitted: uses episode.sourcePath, else demo sintel for skyforge, else test-video.mp4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config, REPO_ROOT } from '../src/config.js';
import { getDb, closeDb } from '../src/db/index.js';
import { encodeEpisodeHls } from '../src/services/encodeQueue.js';

async function main() {
  const episodeId = Number(process.argv[2]);
  if (!Number.isFinite(episodeId) || episodeId <= 0) {
    console.error('Usage: npx tsx scripts/reencode-episode.ts <episodeId> [sourcePath]');
    process.exit(1);
  }

  const db = getDb();
  const ep = db
    .prepare(
      `
      SELECT e.id, e.sourcePath, e.statusEncode, e.hlsPath, s.slug
      FROM episodes e
      JOIN series s ON s.id = e.seriesId
      WHERE e.id = ?
    `,
    )
    .get(episodeId) as
    | { id: number; sourcePath: string | null; statusEncode: string; hlsPath: string | null; slug: string }
    | undefined;

  if (!ep) {
    console.error(`Episode ${episodeId} not found in DB`);
    process.exit(1);
  }

  let input = process.argv[3] ?? ep.sourcePath ?? '';
  if (!input || !fs.existsSync(input)) {
    const sintel = path.join(config.uploadsDir, 'demo', 'sintel-trailer.mp4');
    const testVideo = path.join(REPO_ROOT, 'test-video.mp4');
    if (ep.slug === 'skyforge-academy' && fs.existsSync(sintel)) input = sintel;
    else if (fs.existsSync(testVideo)) input = testVideo;
  }

  if (!input || !fs.existsSync(input)) {
    console.error(`No source file for episode ${episodeId}`);
    process.exit(2);
  }

  // Default full ladder for quality tests; set DEMO_FAST=1 for quick 480p-only bootstrap.
  const fast = process.env.DEMO_FAST === '1';
  console.log(`[reencode] episode=${episodeId} slug=${ep.slug} source=${input} fast=${fast}`);

  db.prepare(
    `UPDATE episodes SET sourcePath = ?, statusEncode = 'encoding', updatedAt = datetime('now') WHERE id = ?`,
  ).run(input, episodeId);

  try {
    const hlsPath = await encodeEpisodeHls(
      episodeId,
      input,
      (p) => {
        process.stdout.write(`\r[reencode] ${Math.round(p)}%   `);
      },
      { fast, maxDurationSec: fast ? 45 : undefined },
    );
    db.prepare(
      `UPDATE episodes SET statusEncode = 'ready', hlsPath = ?, updatedAt = datetime('now') WHERE id = ?`,
    ).run(hlsPath, episodeId);
    console.log(`\n[reencode] ready: /media/${hlsPath}`);
  } catch (err) {
    db.prepare(
      `UPDATE episodes SET statusEncode = 'failed', updatedAt = datetime('now') WHERE id = ?`,
    ).run(episodeId);
    console.error('[reencode] failed', err);
    process.exit(1);
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
