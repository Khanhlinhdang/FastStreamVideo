import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { encodeEpisodeHls } from '../src/services/encodeQueue.js';

async function main() {
  const fixture = path.join(config.uploadsDir, 'dual-audio-fixture.mp4');
  if (!fs.existsSync(fixture)) throw new Error('Run aud028-multi-audio.ts first');
  const hls = await encodeEpisodeHls(9028, fixture, (p) => process.stdout.write(`${p} `), {
    fast: true,
    maxDurationSec: 4,
  });
  const dir = path.join(config.hlsDir, '9028');
  const thumbsVtt = path.join(dir, 'thumbs.vtt');
  const thumbsJpg = path.join(dir, 'thumbs.jpg');
  const master = fs.readFileSync(path.join(dir, 'master.m3u8'), 'utf8');
  const media = (master.match(/#EXT-X-MEDIA:TYPE=AUDIO/g) || []).length;
  console.log('\n', { hls, thumbsVtt: fs.existsSync(thumbsVtt), thumbsJpg: fs.existsSync(thumbsJpg), media });
  if (!fs.existsSync(thumbsVtt) || !fs.existsSync(thumbsJpg)) throw new Error('thumbs missing');
  if (media < 2) throw new Error('multi-audio missing on master');
  // Simulate player VTT URL 200
  const vtt = fs.readFileSync(thumbsVtt, 'utf8');
  if (!vtt.includes('xywh=')) throw new Error('thumbs.vtt missing sprite regions');
  console.log('THUMB+AUDIO encode PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
