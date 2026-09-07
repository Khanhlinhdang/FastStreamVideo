import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { config } from '../config.js';
import { signMediaPath } from './mediaSign.js';

export type SeriesRow = {
  id: number;
  slug: string;
  title: string;
  synopsis: string;
  posterUrl: string | null;
  status: 'ongoing' | 'completed';
  kind?: 'movie' | 'series' | null;
  year: number | null;
  country?: string | null;
  viewCount: number;
  qualityLabel: string | null;
  audioLabel: string | null;
  isHot: number;
  rankingScore: number;
  tagline?: string | null;
  runtimeSec?: number | null;
  ageRating?: string | null;
  director?: string | null;
  castJson?: string | null;
  tagsJson?: string | null;
  trailerUrl?: string | null;
  updatedAt: string;
  createdAt: string;
};

export type GenreRow = { id: number; name: string; slug: string };

export type EpisodeRow = {
  id: number;
  seriesId: number;
  seasonNumber?: number | null;
  number: number;
  title: string;
  durationSec: number;
  qualityLabel: string | null;
  audioLabel: string | null;
  statusEncode: string;
  hlsPath: string | null;
  /** local = VPS /media/hls; r2 = absolute R2_PUBLIC_BASE_URL */
  hlsStorage?: string | null;
  viewCount: number;
  updatedAt: string;
  introEndSec?: number | null;
  creditsStartSec?: number | null;
};

export type CastMember = { name: string; slug?: string; role?: string };

function parseJsonArray<T>(raw: string | null | undefined, fallback: T[] = []): T[] {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function parseCast(raw: string | null | undefined): CastMember[] {
  const arr = parseJsonArray<unknown>(raw);
  return arr
    .map((item) => {
      if (typeof item === 'string') return { name: item };
      if (item && typeof item === 'object' && 'name' in item) {
        const o = item as CastMember;
        return {
          name: String(o.name ?? ''),
          slug: o.slug ? String(o.slug) : undefined,
          role: o.role ? String(o.role) : undefined,
        };
      }
      return null;
    })
    .filter((x): x is CastMember => !!x && !!x.name);
}

export function slugifyPerson(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export type RatingAgg = {
  ratingAvg: number | null;
  ratingCount: number;
  userRating?: number | null;
};

export function getRatingAgg(
  db: Database.Database,
  seriesId: number,
  userId?: number,
): RatingAgg {
  const row = db
    .prepare(
      `SELECT AVG(score) AS avgScore, COUNT(*) AS cnt FROM ratings WHERE seriesId = ?`,
    )
    .get(seriesId) as { avgScore: number | null; cnt: number };
  let userRating: number | null = null;
  if (userId != null) {
    const ur = db
      .prepare(`SELECT score FROM ratings WHERE seriesId = ? AND userId = ?`)
      .get(seriesId, userId) as { score: number } | undefined;
    userRating = ur?.score ?? null;
  }
  return {
    ratingAvg: row.cnt > 0 && row.avgScore != null ? Math.round(row.avgScore * 10) / 10 : null,
    ratingCount: row.cnt,
    userRating,
  };
}

export function mapSeries(
  row: SeriesRow,
  genres: GenreRow[] = [],
  extras: Record<string, unknown> = {},
) {
  const cast = parseCast(row.castJson);
  const tags = parseJsonArray<string>(row.tagsJson).map(String);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    synopsis: row.synopsis,
    posterUrl: row.posterUrl,
    status: row.status,
    kind: row.kind === 'movie' ? 'movie' : 'series',
    year: row.year,
    country: row.country ?? '',
    viewCount: row.viewCount,
    qualityLabel: row.qualityLabel,
    audioLabel: row.audioLabel,
    isHot: Boolean(row.isHot),
    rankingScore: row.rankingScore,
    tagline: row.tagline ?? '',
    runtimeSec: row.runtimeSec ?? null,
    ageRating: row.ageRating ?? '',
    director: row.director ?? '',
    cast,
    tags,
    trailerUrl: row.trailerUrl ?? null,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    genres,
    ...extras,
  };
}

export function mapEpisode(row: EpisodeRow, extras: Record<string, unknown> = {}) {
  let playbackUrl: string | null = null;
  const hlsStorage = row.hlsStorage === 'r2' ? 'r2' : 'local';
  if (row.statusEncode === 'ready' && row.hlsPath) {
    // R2 absolute URL when published (do not sign — shared CDN cache key)
    if (hlsStorage === 'r2' && config.r2PublicBaseUrl) {
      const base = config.r2PublicBaseUrl.replace(/\/+$/, '');
      playbackUrl = `${base}/hls/${row.id}/master.m3u8`;
    } else {
      const cleaned = row.hlsPath.replace(/^\/?media\//, '');
      playbackUrl = `/media/${cleaned}`;
      if (config.signedMedia) {
        const q = signMediaPath(playbackUrl);
        playbackUrl = `${playbackUrl}?${q}`;
      }
    }
  }

  let thumbsVttUrl: string | null = (extras.thumbsVttUrl as string | null) ?? null;
  if (!thumbsVttUrl && row.statusEncode === 'ready') {
    if (hlsStorage === 'r2' && config.r2PublicBaseUrl) {
      const base = config.r2PublicBaseUrl.replace(/\/+$/, '');
      thumbsVttUrl = `${base}/hls/${row.id}/thumbs.vtt`;
    } else {
      const thumbsRel = path.join(config.hlsDir, String(row.id), 'thumbs.vtt');
      if (fs.existsSync(thumbsRel)) {
        thumbsVttUrl = `/media/hls/${row.id}/thumbs.vtt`;
      }
    }
  }

  return {
    id: row.id,
    seriesId: row.seriesId,
    seasonNumber: row.seasonNumber ?? 1,
    number: row.number,
    title: row.title,
    durationSec: row.durationSec,
    qualityLabel: row.qualityLabel,
    audioLabel: row.audioLabel,
    statusEncode: row.statusEncode,
    hlsPath: row.hlsPath,
    hlsStorage,
    playbackUrl,
    viewCount: row.viewCount,
    updatedAt: row.updatedAt,
    introEndSec: row.introEndSec ?? null,
    creditsStartSec: row.creditsStartSec ?? null,
    thumbsVttUrl,
    audioTracks:
      (extras.audioTracks as unknown[]) ??
      (row.statusEncode === 'ready' ? getAudioTracksForEpisode(row.id) : []),
    ...extras,
    subtitles: extras.subtitles ?? [],
  };
}

export function getSubtitlesForEpisode(
  db: Database.Database,
  episodeId: number,
): { id: number; label: string; lang: string; url: string }[] {
  const rows = db
    .prepare(
      `SELECT id, label, lang, path FROM episode_subtitles WHERE episodeId = ? ORDER BY id`,
    )
    .all(episodeId) as { id: number; label: string; lang: string; path: string }[];
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    lang: r.lang,
    url: r.path.startsWith('/') ? r.path : `/media/${r.path.replace(/^\/?media\//, '')}`,
  }));
}

export function getAudioTracksForEpisode(
  episodeId: number,
): { index: number; label: string; lang: string; uri: string }[] {
  const metaPath = path.join(config.hlsDir, String(episodeId), 'audio-tracks.json');
  if (!fs.existsSync(metaPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as Array<{
      index: number;
      label: string;
      lang: string;
      uri?: string;
    }>;
    return raw.map((t) => ({
      index: t.index,
      label: t.label,
      lang: t.lang,
      uri: t.uri ?? '',
    }));
  } catch {
    return [];
  }
}

export function getGenresForSeries(db: Database.Database, seriesId: number): GenreRow[] {
  return db
    .prepare(
      `
      SELECT g.id, g.name, g.slug
      FROM genres g
      JOIN series_genres sg ON sg.genreId = g.id
      WHERE sg.seriesId = ?
      ORDER BY g.name
    `,
    )
    .all(seriesId) as GenreRow[];
}

export function getScheduleWeekdays(db: Database.Database, seriesId: number): number[] {
  const rows = db
    .prepare(
      `SELECT weekday FROM schedule WHERE seriesId = ? AND deletedAt IS NULL ORDER BY weekday`,
    )
    .all(seriesId) as { weekday: number }[];
  return rows.map((r) => r.weekday);
}
