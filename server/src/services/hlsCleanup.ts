/**
 * Cleanup local HLS trees for episodes already published to R2 (and verified).
 * Never deletes source uploads. Dry-run by default unless confirm=true.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { isR2Configured, r2PublicUrl } from '../lib/r2.js';

export type CleanupCandidate = {
  episodeId: number;
  hlsStorage: string;
  localDir: string;
  bytes: number;
  publicMasterUrl: string | null;
};

function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = (p: string) => {
    for (const name of fs.readdirSync(p)) {
      const full = path.join(p, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else total += st.size;
    }
  };
  walk(dir);
  return total;
}

export function listR2LocalCleanupCandidates(minAgeHours = 24): CleanupCandidate[] {
  const rows = getDb()
    .prepare(
      `SELECT id, hlsStorage, updatedAt FROM episodes
       WHERE deletedAt IS NULL
         AND statusEncode = 'ready'
         AND hlsStorage = 'r2'
         AND updatedAt <= datetime('now', ?)
       ORDER BY id`,
    )
    .all(`-${minAgeHours} hours`) as { id: number; hlsStorage: string; updatedAt: string }[];

  return rows
    .map((r) => {
      const localDir = path.join(config.hlsDir, String(r.id));
      if (!fs.existsSync(localDir)) return null;
      return {
        episodeId: r.id,
        hlsStorage: r.hlsStorage,
        localDir,
        bytes: dirBytes(localDir),
        publicMasterUrl: isR2Configured() ? r2PublicUrl(`hls/${r.id}/master.m3u8`) : null,
      };
    })
    .filter((x): x is CleanupCandidate => x != null);
}

export type CleanupResult = {
  dryRun: boolean;
  candidates: CleanupCandidate[];
  removed: number[];
  freedBytes: number;
  errors: { episodeId: number; error: string }[];
};

/**
 * Remove local HLS dirs for R2-published episodes.
 * Requires playback to use R2 (`hlsStorage=r2`). Optional HEAD check via fetch when verifyUrl=true.
 */
export async function cleanupLocalHlsAfterR2(options: {
  dryRun?: boolean;
  minAgeHours?: number;
  episodeIds?: number[];
  verifyUrl?: boolean;
}): Promise<CleanupResult> {
  const dryRun = options.dryRun !== false;
  const minAgeHours = options.minAgeHours ?? 24;
  let candidates = listR2LocalCleanupCandidates(minAgeHours);
  if (options.episodeIds?.length) {
    const allow = new Set(options.episodeIds);
    candidates = candidates.filter((c) => allow.has(c.episodeId));
  }

  const removed: number[] = [];
  const errors: { episodeId: number; error: string }[] = [];
  let freedBytes = 0;

  for (const c of candidates) {
    if (options.verifyUrl && c.publicMasterUrl) {
      try {
        const res = await fetch(c.publicMasterUrl, { method: 'HEAD' });
        if (!res.ok) {
          errors.push({ episodeId: c.episodeId, error: `R2 HEAD ${res.status}` });
          continue;
        }
      } catch (err) {
        errors.push({
          episodeId: c.episodeId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    if (dryRun) {
      freedBytes += c.bytes;
      continue;
    }

    try {
      fs.rmSync(c.localDir, { recursive: true, force: true });
      removed.push(c.episodeId);
      freedBytes += c.bytes;
      getDb()
        .prepare(
          `UPDATE episodes SET updatedAt = datetime('now') WHERE id = ?`,
        )
        .run(c.episodeId);
    } catch (err) {
      errors.push({
        episodeId: c.episodeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { dryRun, candidates, removed, freedBytes, errors };
}
