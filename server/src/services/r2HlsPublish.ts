/**
 * Publish a local HLS tree to R2 after encode.
 * Order: media segments/init first → variant playlists → master last (atomic enough for dual-read).
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { isR2Configured, r2PutObject, r2PublicUrl } from '../lib/r2.js';

export type PublishMode = 'off' | 'hot' | 'all';

export function getPublishMode(): PublishMode {
  const raw = (process.env.R2_PUBLISH_MODE ?? config.r2PublishMode ?? 'off').toLowerCase();
  if (raw === 'hot' || raw === 'all' || raw === 'off') return raw;
  return 'off';
}

export function shouldPublishEpisode(episodeId: number): boolean {
  if (!isR2Configured()) return false;
  const mode = getPublishMode();
  if (mode === 'off') return false;
  if (mode === 'all') return true;
  // hot: series.isHot
  const row = getDb()
    .prepare(
      `SELECT s.isHot AS isHot
       FROM episodes e
       JOIN series s ON s.id = e.seriesId
       WHERE e.id = ?`,
    )
    .get(episodeId) as { isHot: number } | undefined;
  return Boolean(row?.isHot);
}

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (lower.endsWith('.m4s')) return 'video/iso.segment';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.vtt')) return 'text/vtt; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function cacheControlFor(filePath: string): string {
  const lower = filePath.toLowerCase();
  const base = path.basename(lower);
  if (
    lower.endsWith('.m4s') ||
    base === 'init.mp4' ||
    /^init_\d+\.mp4$/.test(base)
  ) {
    return 'public, max-age=31536000, immutable';
  }
  if (lower.endsWith('.m3u8')) return 'public, max-age=60';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) {
    return 'public, max-age=86400';
  }
  return 'public, max-age=3600';
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (p: string) => {
    for (const name of fs.readdirSync(p)) {
      const full = path.join(p, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

function uploadPriority(relPosix: string): number {
  // Higher = later. Segments first, playlists last, master last of all.
  if (relPosix.endsWith('master.m3u8')) return 100;
  if (relPosix.endsWith('.m3u8')) return 50;
  return 0;
}

export type PublishResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  prefix?: string;
  publicMasterUrl?: string;
  uploaded?: number;
  error?: string;
};

/**
 * Upload local `HLS_DIR/<episodeId>/` → R2 key prefix `hls/<episodeId>/`.
 * On success sets episodes.hlsStorage = 'r2'. Failures leave local playable.
 */
export async function publishEpisodeHlsToR2(
  episodeId: number,
  options?: { force?: boolean },
): Promise<PublishResult> {
  if (!options?.force && !shouldPublishEpisode(episodeId)) {
    return { ok: true, skipped: true, reason: 'publish not required for this episode' };
  }
  if (!isR2Configured()) {
    return { ok: false, error: 'R2 is not configured' };
  }

  const localDir = path.join(config.hlsDir, String(episodeId));
  if (!fs.existsSync(localDir)) {
    return { ok: false, error: `local HLS missing: ${localDir}` };
  }

  const files = walkFiles(localDir);
  if (files.length === 0) {
    return { ok: false, error: 'empty HLS directory' };
  }

  const prefix = `hls/${episodeId}`;
  const sorted = files
    .map((full) => {
      const rel = path.relative(localDir, full).split(path.sep).join('/');
      return { full, rel, prio: uploadPriority(rel) };
    })
    .sort((a, b) => a.prio - b.prio || a.rel.localeCompare(b.rel));

  let uploaded = 0;
  const maxAttempts = 3;
  try {
    for (const f of sorted) {
      const key = `${prefix}/${f.rel}`;
      const body = fs.readFileSync(f.full);
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await r2PutObject(key, body, contentTypeFor(f.full), cacheControlFor(f.full));
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 250 * attempt));
          }
        }
      }
      if (lastErr) throw lastErr;
      uploaded += 1;
    }

    getDb()
      .prepare(
        `UPDATE episodes SET hlsStorage = 'r2', updatedAt = datetime('now') WHERE id = ?`,
      )
      .run(episodeId);

    const publicMasterUrl = r2PublicUrl(`${prefix}/master.m3u8`);
    console.log(`[r2] published episode ${episodeId} (${uploaded} objects) → ${publicMasterUrl}`);
    return { ok: true, prefix, publicMasterUrl, uploaded };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[r2] publish failed for episode ${episodeId} (local still playable):`, msg);
    return { ok: false, prefix, uploaded, error: msg };
  }
}

/** Dry-run helper: list local files that would upload. */
export function listHlsFilesForPublish(episodeId: number): string[] {
  const localDir = path.join(config.hlsDir, String(episodeId));
  return walkFiles(localDir).map((f) => path.relative(localDir, f).split(path.sep).join('/'));
}
