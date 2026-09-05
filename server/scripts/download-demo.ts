/**
 * Download short Blender open-movie trailers into media/uploads/demo/
 */
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { config, REPO_ROOT } from '../src/config.js';

const DEMO_DIR = path.join(config.uploadsDir, 'demo');

type DemoAsset = {
  key: string;
  filename: string;
  urls: string[];
};

const ASSETS: DemoAsset[] = [
  {
    key: 'big-buck-bunny',
    filename: 'big-buck-bunny.mp4',
    urls: [
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    ],
  },
  {
    key: 'sintel',
    filename: 'sintel-trailer.mp4',
    urls: [
      'https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4',
      'https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4',
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    ],
  },
];

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = client.get(url, { headers: { 'User-Agent': 'LiveStream-Demo/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch {
          /* ignore */
        }
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', (err) => {
      try {
        file.close();
        fs.unlinkSync(dest);
      } catch {
        /* ignore */
      }
      reject(err);
    });
  });
}

async function ensureAsset(asset: DemoAsset): Promise<string> {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
  const dest = path.join(DEMO_DIR, asset.filename);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 50_000) {
    console.log(`[demo] already have ${asset.filename}`);
    return dest;
  }
  let lastErr: unknown;
  for (const url of asset.urls) {
    try {
      console.log(`[demo] downloading ${asset.key} from ${url}`);
      const ext = path.extname(new URL(url).pathname) || path.extname(asset.filename) || '.mp4';
      const out = path.join(DEMO_DIR, `${path.parse(asset.filename).name}${ext}`);
      await download(url, out);
      console.log(`[demo] saved ${out}`);
      return out;
    } catch (err) {
      lastErr = err;
      console.warn(`[demo] failed ${url}:`, err);
    }
  }

  // Local fallback
  const localTest = path.join(REPO_ROOT, 'test-video.mp4');
  if (fs.existsSync(localTest)) {
    console.warn(`[demo] using local test-video.mp4 for ${asset.key}`);
    return localTest;
  }
  throw lastErr ?? new Error(`Failed to download ${asset.key}`);
}

async function main() {
  console.log('Repo root:', REPO_ROOT);
  console.log('ffmpeg:', config.ffmpegPath);
  const paths: Record<string, string> = {};
  for (const asset of ASSETS) {
    paths[asset.key] = await ensureAsset(asset);
  }
  const manifest = path.join(DEMO_DIR, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify(paths, null, 2));
  console.log('Wrote', manifest);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
