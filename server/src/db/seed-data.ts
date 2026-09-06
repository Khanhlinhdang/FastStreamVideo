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

/** Fictional catalog — not scraped from any site. Demo keys map to open-movie encodes. */
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
    isHot: false,
    genres: ['hanh-dong', 'khoa-hoc-vien-tuong'],
    scheduleWeekdays: [1, 4],
    scheduleNote: '21:00',
    episodes: [
      { number: 1, title: 'Harbor Lights', durationSec: 596, markReadyKey: 'big-buck-bunny' },
      { number: 2, title: 'Static Rain', durationSec: 1420 },
      { number: 3, title: 'Ghost Protocol', durationSec: 1380 },
      { number: 4, title: 'Dockside Echo', durationSec: 1450 },
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
    isHot: false,
    genres: ['hoc-duong', 'gia-tuong', 'phieu-luu'],
    scheduleWeekdays: [2, 5],
    scheduleNote: '20:30',
    episodes: [
      { number: 1, title: 'First Gust', durationSec: 888, markReadyKey: 'sintel' },
      { number: 2, title: 'Cloud Trial', durationSec: 1320 },
      { number: 3, title: 'Storm Class', durationSec: 1290 },
    ],
  },
  {
    slug: 'steel-tears-unit',
    title: 'Steel Tears Unit',
    synopsis: 'Đội đặc nhiệm thời chiến tranh robot. Metadata demo; encode tùy chọn.',
    posterUrl: '/media/posters/steel-tears.svg',
    status: 'completed',
    year: 2023,
    viewCount: 0,
    rankingScore: 0,
    genres: ['hanh-dong', 'khoa-hoc-vien-tuong'],
    episodes: [
      { number: 1, title: 'Briefing', durationSec: 1200 },
      { number: 2, title: 'Breach', durationSec: 1250 },
      { number: 3, title: 'Ashes', durationSec: 1400 },
      { number: 4, title: 'Ceasefire', durationSec: 1500 },
      { number: 5, title: 'Epilogue', durationSec: 900 },
    ],
  },
  {
    slug: 'bamboo-racket-club',
    title: 'Bamboo Racket Club',
    synopsis: 'CLB cầu lông trường cấp 3 và mùa giải huyện.',
    posterUrl: '/media/posters/bamboo-racket.svg',
    status: 'ongoing',
    year: 2025,
    viewCount: 0,
    rankingScore: 0,
    isHot: false,
    genres: ['the-thao', 'hoc-duong', 'hai-huoc'],
    scheduleWeekdays: [3],
    scheduleNote: '19:00',
    episodes: [
      { number: 1, title: 'Serve', durationSec: 1100 },
      { number: 2, title: 'Smash', durationSec: 1150 },
      { number: 3, title: 'Deuce', durationSec: 1180 },
    ],
  },
  {
    slug: 'midnight-station-cafe',
    title: 'Midnight Station Café',
    synopsis: 'Quán cà phê mở cửa nửa đêm bên ga tàu cũ, nơi những câu chuyện tình gặp nhau.',
    posterUrl: '/media/posters/midnight-cafe.svg',
    status: 'ongoing',
    year: 2024,
    viewCount: 0,
    rankingScore: 0,
    genres: ['tinh-cam', 'gia-dinh'],
    scheduleWeekdays: [6],
    scheduleNote: '22:00',
    episodes: [
      { number: 1, title: 'First Shift', durationSec: 1080 },
      { number: 2, title: 'Late Train', durationSec: 1120 },
      { number: 3, title: 'Shared Umbrella', durationSec: 1200 },
      { number: 4, title: 'Last Call', durationSec: 1250 },
    ],
  },
  {
    slug: 'pixel-dungeon-raiders',
    title: 'Pixel Dungeon Raiders',
    synopsis: 'Nhóm streamer bị kéo vào game 8-bit và phải clear dungeon thật.',
    posterUrl: '/media/posters/pixel-dungeon.svg',
    status: 'ongoing',
    year: 2025,
    viewCount: 0,
    rankingScore: 0,
    isHot: false,
    genres: ['phieu-luu', 'hai-huoc', 'gia-tuong'],
    scheduleWeekdays: [0, 3],
    scheduleNote: '18:30',
    episodes: [
      { number: 1, title: 'Login', durationSec: 1000 },
      { number: 2, title: 'Party Wipe', durationSec: 1050 },
      { number: 3, title: 'Loot Goblin', durationSec: 1100 },
      { number: 4, title: 'Boss Room', durationSec: 1300 },
      { number: 5, title: 'Save Point', durationSec: 980 },
    ],
  },
  {
    slug: 'fogbound-manor',
    title: 'Fogbound Manor',
    synopsis: 'Biệt thự sương mù và những bước chân không thuộc về ai.',
    posterUrl: '/media/posters/fogbound.svg',
    status: 'completed',
    year: 2022,
    viewCount: 0,
    rankingScore: 0,
    genres: ['kinh-di', 'gia-tuong'],
    episodes: [
      { number: 1, title: 'Invitation', durationSec: 1220 },
      { number: 2, title: 'Attic', durationSec: 1280 },
      { number: 3, title: 'Portrait', durationSec: 1310 },
      { number: 4, title: 'Dawn', durationSec: 1400 },
    ],
  },
  {
    slug: 'orbit-kitchen',
    title: 'Orbit Kitchen',
    synopsis: 'Đầu bếp trên trạm vũ trụ nấu cho thủy thủ đoàn hỗn loạn.',
    posterUrl: '/media/posters/orbit-kitchen.svg',
    status: 'ongoing',
    year: 2025,
    viewCount: 0,
    rankingScore: 0,
    genres: ['hai-huoc', 'khoa-hoc-vien-tuong', 'gia-dinh'],
    scheduleWeekdays: [5],
    scheduleNote: '17:00',
    episodes: [
      { number: 1, title: 'Zero-G Roux', durationSec: 960 },
      { number: 2, title: 'Alien Allergy', durationSec: 990 },
      { number: 3, title: 'Supply Drop', durationSec: 1020 },
    ],
  },
  {
    slug: 'river-lantern-festival',
    title: 'River Lantern Festival',
    synopsis: 'Lễ hội đèn sông và lời hứa năm năm một lần.',
    posterUrl: '/media/posters/river-lantern.svg',
    status: 'completed',
    year: 2021,
    viewCount: 0,
    rankingScore: 0,
    genres: ['tinh-cam', 'gia-dinh', 'gia-tuong'],
    episodes: [
      { number: 1, title: 'Paper Boat', durationSec: 1150 },
      { number: 2, title: 'Wish Fire', durationSec: 1180 },
      { number: 3, title: 'Current', durationSec: 1210 },
    ],
  },
  {
    slug: 'volt-track-racers',
    title: 'Volt Track Racers',
    synopsis: 'Đua xe điện dưới lòng thành phố hầm.',
    posterUrl: '/media/posters/volt-track.svg',
    status: 'ongoing',
    year: 2024,
    viewCount: 0,
    rankingScore: 0,
    isHot: false,
    genres: ['hanh-dong', 'the-thao'],
    scheduleWeekdays: [1, 6],
    scheduleNote: '20:00',
    episodes: [
      { number: 1, title: 'Grid', durationSec: 1080 },
      { number: 2, title: 'Drift Lane', durationSec: 1120 },
      { number: 3, title: 'Blackout Lap', durationSec: 1190 },
      { number: 4, title: 'Finish Line', durationSec: 1250 },
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
