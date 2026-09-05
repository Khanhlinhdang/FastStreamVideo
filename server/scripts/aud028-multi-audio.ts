/**
 * AUD-028 gate: build dual-audio fixture (if ffmpeg), package multi-audio helpers,
 * assert master EXT-X-MEDIA + audio-tracks.json when ≥2 streams.
 *
 * Usage: npx tsx server/scripts/aud028-multi-audio.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config, REPO_ROOT } from '../src/config.js';
import {
  packageMultiAudioForEpisode,
  probeAudioStreams,
  rewriteMasterWithAudioGroup,
} from '../src/services/encodeQueue.js';

const outFixture = path.join(config.uploadsDir, 'dual-audio-fixture.mp4');
const workDir = path.join(config.hlsDir, 'aud028-test');

function run(bin: string, args: string[]): number {
  const r = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
  }
  return r.status ?? 1;
}

async function ensureFixture(): Promise<string> {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  if (fs.existsSync(outFixture)) {
    const streams = await probeAudioStreams(outFixture);
    if (streams.length >= 2) return outFixture;
  }
  console.log('Creating dual-audio fixture via ffmpeg...');
  const code = run(config.ffmpegPath, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=640x360:d=4',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=4',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=880:duration=4',
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-map',
    '2:a',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-metadata:s:a:0',
    'language=vie',
    '-metadata:s:a:0',
    'title=Tieng Viet',
    '-metadata:s:a:1',
    'language=eng',
    '-metadata:s:a:1',
    'title=English',
    '-shortest',
    outFixture,
  ]);
  if (code !== 0) throw new Error('ffmpeg fixture failed');
  return outFixture;
}

async function main() {
  const fixture = await ensureFixture();
  const streams = await probeAudioStreams(fixture);
  console.log('probed audio streams:', streams);
  if (streams.length < 2) {
    throw new Error(`Expected ≥2 audio streams, got ${streams.length}`);
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  // Minimal fake master so rewrite has STREAM-INF targets
  fs.mkdirSync(path.join(workDir, '0'), { recursive: true });
  fs.writeFileSync(path.join(workDir, '0', 'index.m3u8'), '#EXTM3U\n', 'utf8');
  fs.writeFileSync(
    path.join(workDir, 'master.m3u8'),
    `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.4d401f,mp4a.40.2"\n0/index.m3u8\n`,
    'utf8',
  );

  const tracks = await packageMultiAudioForEpisode(workDir, fixture, 999028, 4);
  console.log('tracks:', tracks);
  const master = fs.readFileSync(path.join(workDir, 'master.m3u8'), 'utf8');
  const mediaCount = (master.match(/#EXT-X-MEDIA:TYPE=AUDIO/g) || []).length;
  const metaPath = path.join(workDir, 'audio-tracks.json');
  if (!fs.existsSync(metaPath)) throw new Error('audio-tracks.json missing');
  if (mediaCount < 2) {
    console.error(master);
    throw new Error(`Expected ≥2 EXT-X-MEDIA, got ${mediaCount}`);
  }
  if (!master.includes('AUDIO="audio"')) {
    throw new Error('STREAM-INF missing AUDIO="audio"');
  }
  console.log('AUD-028 PASS', { mediaCount, tracks: tracks.length, repo: REPO_ROOT });
  // keep rewriteMaster export warm
  rewriteMasterWithAudioGroup(workDir, tracks.filter((t) => t.uri));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
