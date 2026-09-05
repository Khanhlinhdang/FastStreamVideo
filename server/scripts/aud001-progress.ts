/**
 * AUD-001: verify encode progress emits ≥5 distinct values between 5 and 99.
 */
import path from 'node:path';
import { config } from '../src/config.js';
import { encodeEpisodeHls } from '../src/services/encodeQueue.js';

async function main() {
  const src = path.join(config.uploadsDir, 'test-video-upload.mp4');
  const seen = new Set<number>();
  const list: number[] = [];
  console.log('[aud-001] encoding', src);
  await encodeEpisodeHls(
    901,
    src,
    (p) => {
      if (!seen.has(p)) {
        seen.add(p);
        list.push(p);
        console.log('[aud-001] progress', p);
      }
    },
    { maxDurationSec: 40 },
  );
  const between = list.filter((p) => p > 5 && p < 100);
  console.log('[aud-001] ALL', list.join(','));
  console.log('[aud-001] BETWEEN_COUNT', between.length);
  if (between.length >= 5 && list[list.length - 1] === 100) {
    console.log('AUD-001 DIRECT PASS');
    process.exit(0);
  }
  console.log('AUD-001 DIRECT FAIL');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
