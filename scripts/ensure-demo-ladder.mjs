/**
 * List ready episodes whose HLS master has fewer than 3 STREAM-INF rungs.
 * Usage: node scripts/ensure-demo-ladder.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hlsDir = path.join(root, 'media', 'hls');

if (!fs.existsSync(hlsDir)) {
  console.log('No media/hls directory');
  process.exit(0);
}

const thin = [];
for (const name of fs.readdirSync(hlsDir)) {
  const master = path.join(hlsDir, name, 'master.m3u8');
  if (!fs.existsSync(master)) continue;
  const text = fs.readFileSync(master, 'utf8');
  const n = (text.match(/#EXT-X-STREAM-INF/g) || []).length;
  if (n < 3) thin.push({ episodeId: name, levels: n });
}

if (thin.length === 0) {
  console.log('All ready HLS masters have ≥3 STREAM-INF.');
} else {
  console.log('Episodes with thin ladder (<3 levels):');
  for (const t of thin) console.log(`  ep ${t.episodeId}: ${t.levels} level(s)`);
  console.log('Fix: $env:DEMO_FULL=1; npm run demo:encode');
  console.log('Or: npx tsx server/scripts/reencode-episode.ts <id>');
}
