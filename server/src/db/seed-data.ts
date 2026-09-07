import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

type GenreSeed = { name: string; slug: string };

type EpisodeSeed = {
  number: number;
  title: string;
  durationSec: number;
  qualityLabel?: string;
  audioLabel?: string;
  /** Mark ready when demo HLS exists under media/hls/{episodeId} after encode-demo */
  markReadyKey?: string;
};

type SeriesSeed = {
  slug: string;
  title: string;
  synopsis: string;
  posterUrl: string;
  status: 'ongoing' | 'completed';
  year: number;
  country?: string;
  /** Seed baseline — real views increment on playback */
  viewCount: number;
  rankingScore: number;
  isHot?: boolean;
  qualityLabel?: string;
  audioLabel?: string;
  genres: string[];
  scheduleWeekdays?: number[];
  scheduleNote?: string;
  episodes: EpisodeSeed[];
};

const GENRES: GenreSeed[] = [
  { name: 'Hành động', slug: 'hanh-dong' },
  { name: 'Phiêu lưu', slug: 'phieu-luu' },
  { name: 'Hài hước', slug: 'hai-huoc' },
  { name: 'Tình cảm', slug: 'tinh-cam' },
  { name: 'Khoa học viễn tưởng', slug: 'khoa-hoc-vien-tuong' },
  { name: 'Giả tưởng', slug: 'gia-tuong' },
  { name: 'Học đường', slug: 'hoc-duong' },
  { name: 'Thể thao', slug: 'the-thao' },
  { name: 'Kinh dị', slug: 'kinh-di' },
  { name: 'Gia đình', slug: 'gia-dinh' },
];

/** Fictional catalog — only series with open-movie demo encodes (playable after bootstrap). */
const SERIES: SeriesSeed[] = [
  {
    slug: 'neon-harbor-chronicles',
    title: 'Neon Harbor Chronicles',
    synopsis:
      'Một thám tử AI và cô bạn đồng hành người máy lần theo manh mối giữa cảng đêm neon. Tập demo dùng Big Buck Bunny (Blender).',
    posterUrl: '/media/posters/neon-harbor.svg',
    status: 'ongoing',
    year: 2024,
    viewCount: 0,
    rankingScore: 0,
    isHot: true,
    genres: ['hanh-dong', 'khoa-hoc-vien-tuong'],
    scheduleWeekdays: [1, 4],
    scheduleNote: '21:00',
    episodes: [
      { number: 1, title: 'Harbor Lights', durationSec: 596, markReadyKey: 'big-buck-bunny' },
    ],
  },
  {
    slug: 'skyforge-academy',
    title: 'Skyforge Academy',
    synopsis:
      'Học viện trên mây nơi học viên luyện thuật gió. Tập demo dùng Sintel (Blender).',
    posterUrl: '/media/posters/skyforge.svg',
    status: 'ongoing',
    year: 2025,
    viewCount: 0,
    rankingScore: 0,
    isHot: true,
    genres: ['hoc-duong', 'gia-tuong', 'phieu-luu'],
    scheduleWeekdays: [2, 5],
    scheduleNote: '20:30',
    episodes: [
      { number: 1, title: 'First Gust', durationSec: 888, markReadyKey: 'sintel' },
    ],
  },
];

/** Maps markReadyKey → relative hls folder name used by encode-demo */
export const DEMO_EPISODE_KEYS: Record<string, string> = {
  'big-buck-bunny': 'demo-bbb',
  sintel: 'demo-sintel',
};

export function seed(db: Database.Database, options?: { markDemoReady?: boolean }): void {
  const markDemoReady = options?.markDemoReady ?? true;

  const run = db.transaction(() => {
    db.exec(`
      DELETE FROM refresh_tokens;
      DELETE FROM encode_jobs;
      DELETE FROM comments;
      DELETE FROM watch_history;
      DELETE FROM favorites;
      DELETE FROM schedule;
      DELETE FROM episodes;
      DELETE FROM series_genres;
      DELETE FROM series;
      DELETE FROM genres;
      DELETE FROM users;
      DELETE FROM sqlite_sequence WHERE name IN (
        'users','genres','series','episodes','schedule','comments','encode_jobs','refresh_tokens'
      );
    `);

    const insertGenre = db.prepare('INSERT INTO genres (name, slug) VALUES (?, ?)');
    const genreIds = new Map<string, number>();
    for (const g of GENRES) {
      const r = insertGenre.run(g.name, g.slug);
      genreIds.set(g.slug, Number(r.lastInsertRowid));
    }

    const passwordHash = bcrypt.hashSync(config.seedAdminPassword, 10);
    db.prepare(
      `INSERT INTO users (email, passwordHash, displayName, role) VALUES (?, ?, ?, 'admin')`,
    ).run(config.seedAdminEmail, passwordHash, config.seedAdminName);

    // editor — catalog/upload/moderation; not disk purge / security
    db.prepare(
      `INSERT INTO users (email, passwordHash, displayName, role) VALUES (?, ?, ?, 'editor')`,
    ).run(
      config.seedEditorEmail,
      bcrypt.hashSync(config.seedEditorPassword, 10),
      config.seedEditorName,
    );

    // demo user
    db.prepare(
      `INSERT INTO users (email, passwordHash, displayName, role) VALUES (?, ?, ?, 'user')`,
    ).run('viewer@livestream.local', bcrypt.hashSync('viewer123', 10), 'Viewer');

    const insertSeries = db.prepare(`
      INSERT INTO series (
        slug, title, synopsis, posterUrl, status, year, country, viewCount,
        qualityLabel, audioLabel, isHot, rankingScore, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const insertSg = db.prepare(
      'INSERT INTO series_genres (seriesId, genreId) VALUES (?, ?)',
    );
    const insertEp = db.prepare(`
      INSERT INTO episodes (
        seriesId, number, title, durationSec, qualityLabel, audioLabel,
        statusEncode, hlsPath, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    const insertSched = db.prepare(
      'INSERT INTO schedule (seriesId, weekday, note) VALUES (?, ?, ?)',
    );

    for (const s of SERIES) {
      const sr = insertSeries.run(
        s.slug,
        s.title,
        s.synopsis,
        s.posterUrl,
        s.status,
        s.year,
        s.country ?? 'Demo',
        s.viewCount,
        s.qualityLabel ?? '1080p',
        s.audioLabel ?? 'SUB+TM',
        s.isHot ? 1 : 0,
        s.rankingScore,
      );
      const seriesId = Number(sr.lastInsertRowid);

      for (const slug of s.genres) {
        const gid = genreIds.get(slug);
        if (gid) insertSg.run(seriesId, gid);
      }

      if (s.scheduleWeekdays) {
        for (const wd of s.scheduleWeekdays) {
          insertSched.run(seriesId, wd, s.scheduleNote ?? '');
        }
      }

      for (const ep of s.episodes) {
        const r = insertEp.run(
          seriesId,
          ep.number,
          ep.title,
          ep.durationSec,
          ep.qualityLabel ?? s.qualityLabel ?? '1080p',
          ep.audioLabel ?? s.audioLabel ?? 'SUB+TM',
          'none',
          null,
        );
        const episodeId = Number(r.lastInsertRowid);

        // If encode-demo already produced HLS for this episode id, mark ready.
        if (markDemoReady && ep.markReadyKey) {
          const master = path.join(config.hlsDir, String(episodeId), 'master.m3u8');
          // Also accept legacy demo folder names from earlier encodes
          const legacyFolder = DEMO_EPISODE_KEYS[ep.markReadyKey];
          const legacyMaster = legacyFolder
            ? path.join(config.hlsDir, legacyFolder, 'master.m3u8')
            : null;
          if (fs.existsSync(master)) {
            db.prepare(
              `UPDATE episodes SET statusEncode = 'ready', hlsPath = ? WHERE id = ?`,
            ).run(`hls/${episodeId}/master.m3u8`, episodeId);
          } else if (legacyMaster && fs.existsSync(legacyMaster)) {
            db.prepare(
              `UPDATE episodes SET statusEncode = 'ready', hlsPath = ? WHERE id = ?`,
            ).run(`hls/${legacyFolder}/master.m3u8`, episodeId);
          }
        }
      }
    }
  });

  run();
  console.log(
    `Seeded ${GENRES.length} genres, ${SERIES.length} series, admin ${config.seedAdminEmail}, editor ${config.seedEditorEmail}`,
  );
}
