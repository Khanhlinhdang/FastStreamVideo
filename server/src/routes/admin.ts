import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, requireEditor } from '../auth/index.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import {
  getGenresForSeries,
  getRatingAgg,
  getScheduleWeekdays,
  getSubtitlesForEpisode,
  mapEpisode,
  mapSeries,
  type EpisodeRow,
  type SeriesRow,
} from '../lib/mappers.js';
import { createEncodeJob, encodeQueue, attachAudioTrackToReadyHls } from '../services/encodeQueue.js';
import {
  isSupabaseStorageEnabled,
  uploadPosterToSupabase,
} from '../lib/supabase.js';
import { isR2Configured } from '../lib/r2.js';
import { publishEpisodeHlsToR2 } from '../services/r2HlsPublish.js';
import { cleanupLocalHlsAfterR2 } from '../services/hlsCleanup.js';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Minimal SRT → WebVTT conversion. */
function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r\n/g, '\n')
    .replace(/^\uFEFF/, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return `WEBVTT\n\n${body.trim()}\n`;
}

function replaceSchedule(
  seriesId: number,
  weekdays: number[] | undefined,
  note?: string,
): void {
  if (weekdays === undefined) return;
  const db = getDb();
  db.prepare(`UPDATE schedule SET deletedAt = datetime('now') WHERE seriesId = ? AND deletedAt IS NULL`).run(
    seriesId,
  );
  const ins = db.prepare(`INSERT INTO schedule (seriesId, weekday, note) VALUES (?, ?, ?)`);
  const unique = [...new Set(weekdays.filter((d) => d >= 0 && d <= 6))];
  for (const wd of unique) {
    ins.run(seriesId, wd, note ?? '');
  }
}

function mapAdminSeries(row: SeriesRow) {
  const db = getDb();
  return mapSeries(row, getGenresForSeries(db, row.id), {
    ...getRatingAgg(db, row.id),
    scheduleWeekdays: getScheduleWeekdays(db, row.id),
  });
}

const seriesBodySchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1).optional(),
  synopsis: z.string().optional(),
  posterUrl: z.string().optional().nullable(),
  status: z.enum(['ongoing', 'completed']).optional(),
  kind: z.enum(['movie', 'series']).optional(),
  year: z.coerce.number().int().optional().nullable(),
  country: z.string().optional().nullable(),
  qualityLabel: z.string().optional(),
  audioLabel: z.string().optional(),
  isHot: z.boolean().optional(),
  rankingScore: z.coerce.number().int().optional(),
  tagline: z.string().optional().nullable(),
  runtimeSec: z.coerce.number().int().optional().nullable(),
  ageRating: z.string().optional().nullable(),
  director: z.string().optional().nullable(),
  cast: z
    .array(
      z.union([
        z.string(),
        z.object({
          name: z.string(),
          slug: z.string().optional(),
          role: z.string().optional(),
        }),
      ]),
    )
    .optional(),
  tags: z.array(z.string()).optional(),
  trailerUrl: z.string().optional().nullable(),
  genreIds: z.array(z.coerce.number().int()).optional(),
  scheduleWeekdays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  scheduleNote: z.string().optional(),
});

function serializeCast(cast: unknown): string {
  if (!Array.isArray(cast)) return '[]';
  return JSON.stringify(
    cast.map((c) => {
      if (typeof c === 'string') return { name: c };
      const o = c as { name?: string; slug?: string; role?: string };
      return { name: o.name ?? '', slug: o.slug, role: o.role };
    }),
  );
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // ——— Dashboard stats ———
  app.get('/api/admin/stats', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const db = getDb();
    const count = (sql: string) =>
      (db.prepare(sql).get() as { c: number }).c;

    return {
      series: count(`SELECT COUNT(*) AS c FROM series WHERE deletedAt IS NULL`),
      episodes: count(`SELECT COUNT(*) AS c FROM episodes WHERE deletedAt IS NULL`),
      genres: count(`SELECT COUNT(*) AS c FROM genres`),
      jobsQueued: count(
        `SELECT COUNT(*) AS c FROM encode_jobs WHERE status IN ('queued', 'encoding')`,
      ),
      jobsReady: count(`SELECT COUNT(*) AS c FROM encode_jobs WHERE status = 'ready'`),
      jobsFailed: count(`SELECT COUNT(*) AS c FROM encode_jobs WHERE status = 'failed'`),
      totalViews: (
        db.prepare(`SELECT COALESCE(SUM(viewCount), 0) AS c FROM series WHERE deletedAt IS NULL`).get() as {
          c: number;
        }
      ).c,
      recentJobs: db
        .prepare(
          `
          SELECT j.*, e.number AS episodeNumber, s.title AS seriesTitle
          FROM encode_jobs j
          JOIN episodes e ON e.id = j.episodeId
          JOIN series s ON s.id = e.seriesId
          ORDER BY j.id DESC LIMIT 8
        `,
        )
        .all(),
    };
  });

  // ——— Genres ———
  app.get('/api/admin/genres', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    return { items: getDb().prepare(`SELECT * FROM genres ORDER BY name`).all() };
  });

  app.post('/api/admin/genres', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const schema = z.object({
      name: z.string().min(1),
      slug: z.string().min(1).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const slug = parsed.data.slug ?? slugify(parsed.data.name);
    try {
      const r = getDb()
        .prepare(`INSERT INTO genres (name, slug) VALUES (?, ?)`)
        .run(parsed.data.name, slug);
      return { id: Number(r.lastInsertRowid), name: parsed.data.name, slug };
    } catch {
      return reply.code(409).send({ error: 'Genre already exists' });
    }
  });

  app.put<{ Params: { id: string } }>('/api/admin/genres/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const schema = z.object({
      name: z.string().min(1).optional(),
      slug: z.string().min(1).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const id = Number(req.params.id);
    const existing = getDb().prepare(`SELECT * FROM genres WHERE id = ?`).get(id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    getDb()
      .prepare(`UPDATE genres SET name = COALESCE(?, name), slug = COALESCE(?, slug) WHERE id = ?`)
      .run(parsed.data.name ?? null, parsed.data.slug ?? null, id);
    return getDb().prepare(`SELECT * FROM genres WHERE id = ?`).get(id);
  });

  app.delete<{ Params: { id: string } }>('/api/admin/genres/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    getDb().prepare(`DELETE FROM genres WHERE id = ?`).run(Number(req.params.id));
    return { ok: true };
  });

  // ——— Series ———
  app.get<{ Querystring: { q?: string; status?: string; country?: string; kind?: string } }>(
    '/api/admin/series',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const db = getDb();
      const where: string[] = ['deletedAt IS NULL'];
      const params: unknown[] = [];
      if (req.query.q) {
        where.push('(title LIKE ? OR slug LIKE ? OR synopsis LIKE ? OR country LIKE ?)');
        const like = `%${req.query.q}%`;
        params.push(like, like, like, like);
      }
      if (req.query.status === 'ongoing' || req.query.status === 'completed') {
        where.push('status = ?');
        params.push(req.query.status);
      }
      if (req.query.kind === 'movie' || req.query.kind === 'series') {
        where.push(`COALESCE(kind, 'series') = ?`);
        params.push(req.query.kind);
      }
      if (req.query.country) {
        where.push('country LIKE ?');
        params.push(`%${req.query.country}%`);
      }
      const rows = db
        .prepare(
          `SELECT * FROM series WHERE ${where.join(' AND ')} ORDER BY updatedAt DESC`,
        )
        .all(...params) as SeriesRow[];
      return { items: rows.map((r) => mapAdminSeries(r)) };
    },
  );

  app.post('/api/admin/series', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const parsed = seriesBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const d = parsed.data;
    const slug = d.slug ?? slugify(d.title);
    const db = getDb();
    try {
      const r = db
        .prepare(
          `INSERT INTO series (
            slug, title, synopsis, posterUrl, status, kind, year, country,
            qualityLabel, audioLabel, isHot, rankingScore,
            tagline, runtimeSec, ageRating, director, castJson, tagsJson, trailerUrl
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          slug,
          d.title,
          d.synopsis ?? '',
          d.posterUrl ?? null,
          d.status ?? 'ongoing',
          d.kind ?? 'series',
          d.year ?? null,
          d.country ?? '',
          d.qualityLabel ?? '1080p',
          d.audioLabel ?? 'SUB+TM',
          d.isHot ? 1 : 0,
          d.rankingScore ?? 0,
          d.tagline ?? '',
          d.runtimeSec ?? null,
          d.ageRating ?? '',
          d.director ?? '',
          d.cast ? serializeCast(d.cast) : '[]',
          d.tags ? JSON.stringify(d.tags) : '[]',
          d.trailerUrl ?? null,
        );
      const seriesId = Number(r.lastInsertRowid);
      if (d.genreIds?.length) {
        const ins = db.prepare(`INSERT INTO series_genres (seriesId, genreId) VALUES (?, ?)`);
        for (const gid of d.genreIds) ins.run(seriesId, gid);
      }
      // Movie: ensure a single placeholder episode #1 for playback unit
      let movieEpisodeId: number | undefined;
      if ((d.kind ?? 'series') === 'movie') {
        const epIns = db
          .prepare(
            `INSERT INTO episodes (seriesId, seasonNumber, number, title, qualityLabel, audioLabel)
             VALUES (?, 1, 1, ?, ?, ?)`,
          )
          .run(seriesId, d.title, d.qualityLabel ?? '1080p', d.audioLabel ?? 'SUB+TM');
        movieEpisodeId = Number(epIns.lastInsertRowid);
      }
      replaceSchedule(seriesId, d.scheduleWeekdays, d.scheduleNote);
      const row = db.prepare(`SELECT * FROM series WHERE id = ?`).get(seriesId) as SeriesRow;
      return { ...mapAdminSeries(row), movieEpisodeId };
    } catch {
      return reply.code(409).send({ error: 'Slug conflict' });
    }
  });

  app.put<{ Params: { id: string } }>('/api/admin/series/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const id = Number(req.params.id);
    const parsed = seriesBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM series WHERE id = ? AND deletedAt IS NULL`)
      .get(id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    const d = parsed.data;
    db.prepare(
      `UPDATE series SET
        title = COALESCE(?, title),
        slug = COALESCE(?, slug),
        synopsis = COALESCE(?, synopsis),
        posterUrl = CASE WHEN ? = 1 THEN ? ELSE posterUrl END,
        status = COALESCE(?, status),
        kind = COALESCE(?, kind),
        year = CASE WHEN ? = 1 THEN ? ELSE year END,
        country = COALESCE(?, country),
        qualityLabel = COALESCE(?, qualityLabel),
        audioLabel = COALESCE(?, audioLabel),
        isHot = COALESCE(?, isHot),
        rankingScore = COALESCE(?, rankingScore),
        tagline = COALESCE(?, tagline),
        runtimeSec = CASE WHEN ? = 1 THEN ? ELSE runtimeSec END,
        ageRating = COALESCE(?, ageRating),
        director = COALESCE(?, director),
        castJson = CASE WHEN ? = 1 THEN ? ELSE castJson END,
        tagsJson = CASE WHEN ? = 1 THEN ? ELSE tagsJson END,
        trailerUrl = CASE WHEN ? = 1 THEN ? ELSE trailerUrl END,
        updatedAt = datetime('now')
       WHERE id = ?`,
    ).run(
      d.title ?? null,
      d.slug ?? null,
      d.synopsis ?? null,
      d.posterUrl !== undefined ? 1 : 0,
      d.posterUrl ?? null,
      d.status ?? null,
      d.kind ?? null,
      d.year !== undefined ? 1 : 0,
      d.year ?? null,
      d.country ?? null,
      d.qualityLabel ?? null,
      d.audioLabel ?? null,
      d.isHot === undefined ? null : d.isHot ? 1 : 0,
      d.rankingScore ?? null,
      d.tagline ?? null,
      d.runtimeSec !== undefined ? 1 : 0,
      d.runtimeSec ?? null,
      d.ageRating ?? null,
      d.director ?? null,
      d.cast !== undefined ? 1 : 0,
      d.cast !== undefined ? serializeCast(d.cast) : null,
      d.tags !== undefined ? 1 : 0,
      d.tags !== undefined ? JSON.stringify(d.tags) : null,
      d.trailerUrl !== undefined ? 1 : 0,
      d.trailerUrl ?? null,
      id,
    );

    if (d.genreIds) {
      db.prepare(`DELETE FROM series_genres WHERE seriesId = ?`).run(id);
      const ins = db.prepare(`INSERT INTO series_genres (seriesId, genreId) VALUES (?, ?)`);
      for (const gid of d.genreIds) ins.run(id, gid);
    }
    replaceSchedule(id, d.scheduleWeekdays, d.scheduleNote);

    const row = db.prepare(`SELECT * FROM series WHERE id = ?`).get(id) as SeriesRow;
    return mapAdminSeries(row);
  });

  app.delete<{ Params: { id: string } }>('/api/admin/series/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    getDb()
      .prepare(`UPDATE series SET deletedAt = datetime('now') WHERE id = ?`)
      .run(Number(req.params.id));
    return { ok: true };
  });

  /** Optional poster file upload → Supabase Storage (if configured) or local media/posters */
  app.post<{ Params: { id: string } }>('/api/admin/series/:id/poster', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const id = Number(req.params.id);
    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM series WHERE id = ? AND deletedAt IS NULL`)
      .get(id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const ext = path.extname(file.filename) || '.jpg';
    const contentType = file.mimetype || 'image/jpeg';

    let posterUrl: string;
    if (isSupabaseStorageEnabled()) {
      try {
        const uploaded = await uploadPosterToSupabase(
          id,
          `series-${id}${ext}`,
          buffer,
          contentType,
        );
        posterUrl = uploaded.publicUrl;
      } catch (err) {
        req.log.error(err);
        return reply.code(502).send({
          error: 'Supabase Storage upload failed',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      const postersDir = path.join(config.mediaRoot, 'posters');
      fs.mkdirSync(postersDir, { recursive: true });
      const destName = `series-${id}-${Date.now()}${ext}`;
      const dest = path.join(postersDir, destName);
      fs.writeFileSync(dest, buffer);
      posterUrl = `/media/posters/${destName}`;
    }

    db.prepare(
      `UPDATE series SET posterUrl = ?, updatedAt = datetime('now') WHERE id = ?`,
    ).run(posterUrl, id);
    const row = db.prepare(`SELECT * FROM series WHERE id = ?`).get(id) as SeriesRow;
    return mapAdminSeries(row);
  });

  // ——— Episodes ———
  app.get<{ Querystring: { seriesId?: string; q?: string } }>(
    '/api/admin/episodes',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const db = getDb();
      const where: string[] = ['e.deletedAt IS NULL'];
      const params: unknown[] = [];
      if (req.query.seriesId) {
        where.push('e.seriesId = ?');
        params.push(Number(req.query.seriesId));
      }
      if (req.query.q) {
        where.push('(e.title LIKE ? OR s.title LIKE ?)');
        const like = `%${req.query.q}%`;
        params.push(like, like);
      }
      const rows = db
        .prepare(
          `
          SELECT e.*, s.title AS seriesTitle, s.slug AS seriesSlug
          FROM episodes e
          JOIN series s ON s.id = e.seriesId
          WHERE ${where.join(' AND ')}
          ORDER BY e.updatedAt DESC
          LIMIT 300
        `,
        )
        .all(...params) as (EpisodeRow & { seriesTitle: string; seriesSlug: string })[];
      return {
        items: rows.map((e) =>
          mapEpisode(e, {
            seriesTitle: e.seriesTitle,
            seriesSlug: e.seriesSlug,
            subtitles: getSubtitlesForEpisode(db, e.id),
          }),
        ),
      };
    },
  );

  app.post('/api/admin/episodes', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const schema = z.object({
      seriesId: z.coerce.number().int().positive(),
      number: z.coerce.number().int().positive(),
      seasonNumber: z.coerce.number().int().positive().optional(),
      title: z.string().optional(),
      durationSec: z.coerce.number().int().optional(),
      qualityLabel: z.string().optional(),
      audioLabel: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const d = parsed.data;
    const db = getDb();
    const parent = db
      .prepare(`SELECT id, kind, title FROM series WHERE id = ? AND deletedAt IS NULL`)
      .get(d.seriesId) as { id: number; kind: string | null; title: string } | undefined;
    if (!parent) return reply.code(404).send({ error: 'Series not found' });
    if ((parent.kind ?? 'series') === 'movie') {
      if (d.number !== 1) {
        return reply
          .code(400)
          .send({ error: 'Phim lẻ chỉ có 1 tập — dùng số tập = 1 hoặc upload vào tập sẵn có' });
      }
      const existing = db
        .prepare(
          `SELECT * FROM episodes WHERE seriesId = ? AND number = 1 AND deletedAt IS NULL`,
        )
        .get(d.seriesId) as EpisodeRow | undefined;
      if (existing) {
        return reply.code(409).send({
          error: 'Phim lẻ đã có tập #1 — hãy upload/thay video trên tập đó thay vì tạo mới',
          episodeId: existing.id,
        });
      }
    }
    try {
      const r = db
        .prepare(
          `INSERT INTO episodes (seriesId, seasonNumber, number, title, durationSec, qualityLabel, audioLabel)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          d.seriesId,
          d.seasonNumber ?? 1,
          d.number,
          d.title ?? (parent.kind === 'movie' ? parent.title : `Tập ${d.number}`),
          d.durationSec ?? 0,
          d.qualityLabel ?? '1080p',
          d.audioLabel ?? 'SUB+TM',
        );
      db.prepare(`UPDATE series SET updatedAt = datetime('now') WHERE id = ?`).run(d.seriesId);
      const row = db
        .prepare(`SELECT * FROM episodes WHERE id = ?`)
        .get(Number(r.lastInsertRowid)) as EpisodeRow;
      return mapEpisode(row);
    } catch {
      return reply.code(409).send({ error: 'Episode number conflict' });
    }
  });

  app.put<{ Params: { id: string } }>('/api/admin/episodes/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const id = Number(req.params.id);
    const schema = z.object({
      number: z.coerce.number().int().positive().optional(),
      seasonNumber: z.coerce.number().int().positive().optional(),
      title: z.string().optional(),
      durationSec: z.coerce.number().int().optional(),
      qualityLabel: z.string().optional(),
      audioLabel: z.string().optional(),
      introEndSec: z.coerce.number().int().nonnegative().nullable().optional(),
      creditsStartSec: z.coerce.number().int().nonnegative().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const db = getDb();
    const existing = db
      .prepare(`SELECT * FROM episodes WHERE id = ? AND deletedAt IS NULL`)
      .get(id);
    if (!existing) return reply.code(404).send({ error: 'Not found' });
    const d = parsed.data;
    try {
      const existingRow = existing as EpisodeRow;
      db.prepare(
        `UPDATE episodes SET
          number = COALESCE(?, number),
          seasonNumber = COALESCE(?, seasonNumber),
          title = COALESCE(?, title),
          durationSec = COALESCE(?, durationSec),
          qualityLabel = COALESCE(?, qualityLabel),
          audioLabel = COALESCE(?, audioLabel),
          introEndSec = ?,
          creditsStartSec = ?,
          updatedAt = datetime('now')
         WHERE id = ?`,
      ).run(
        d.number ?? null,
        d.seasonNumber ?? null,
        d.title ?? null,
        d.durationSec ?? null,
        d.qualityLabel ?? null,
        d.audioLabel ?? null,
        d.introEndSec !== undefined ? d.introEndSec : (existingRow.introEndSec ?? null),
        d.creditsStartSec !== undefined
          ? d.creditsStartSec
          : (existingRow.creditsStartSec ?? null),
        id,
      );
    } catch {
      return reply.code(409).send({ error: 'Episode number conflict' });
    }
    return mapEpisode(db.prepare(`SELECT * FROM episodes WHERE id = ?`).get(id) as EpisodeRow);
  });

  app.delete<{ Params: { id: string } }>('/api/admin/episodes/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    getDb()
      .prepare(`UPDATE episodes SET deletedAt = datetime('now') WHERE id = ?`)
      .run(Number(req.params.id));
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>(
    '/api/admin/episodes/:id/upload',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const db = getDb();
      const episode = db
        .prepare(`SELECT * FROM episodes WHERE id = ? AND deletedAt IS NULL`)
        .get(episodeId);
      if (!episode) return reply.code(404).send({ error: 'Episode not found' });

      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });

      fs.mkdirSync(config.uploadsDir, { recursive: true });
      const ext = path.extname(file.filename) || '.mp4';
      const dest = path.join(config.uploadsDir, `ep-${episodeId}-${Date.now()}${ext}`);
      const write = fs.createWriteStream(dest);
      await new Promise<void>((resolve, reject) => {
        file.file.pipe(write);
        write.on('finish', resolve);
        write.on('error', reject);
        file.file.on('error', reject);
      });

      db.prepare(
        `UPDATE episodes SET sourcePath = ?, statusEncode = 'queued', hlsPath = NULL, hlsStorage = 'local', updatedAt = datetime('now') WHERE id = ?`,
      ).run(dest, episodeId);

      // Full ABR ladder (never fast/480p-only) for admin uploads & replace
      const jobId = createEncodeJob(episodeId);
      return { ok: true, episodeId, jobId, sourcePath: dest };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/episodes/:id/subtitles',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const db = getDb();
      const episode = db
        .prepare(`SELECT id FROM episodes WHERE id = ? AND deletedAt IS NULL`)
        .get(episodeId);
      if (!episode) return reply.code(404).send({ error: 'Episode not found' });

      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });
      const lower = file.filename.toLowerCase();
      if (!lower.endsWith('.vtt') && !lower.endsWith('.srt')) {
        return reply.code(400).send({ error: 'Only .vtt or .srt allowed' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      let text = Buffer.concat(chunks).toString('utf8');
      if (lower.endsWith('.srt')) {
        text = srtToVtt(text);
      } else if (!text.trimStart().startsWith('WEBVTT')) {
        text = `WEBVTT\n\n${text}`;
      }

      const fields = file.fields as Record<string, { value?: string } | undefined>;
      const label =
        (typeof fields?.label === 'object' && fields.label?.value) ||
        req.headers['x-subtitle-label'] ||
        'Tiếng Việt';
      const lang =
        (typeof fields?.lang === 'object' && fields.lang?.value) ||
        req.headers['x-subtitle-lang'] ||
        'vi';

      const subDir = path.join(config.mediaRoot, 'subs', String(episodeId));
      fs.mkdirSync(subDir, { recursive: true });
      const destName = `${Date.now()}.vtt`;
      const abs = path.join(subDir, destName);
      fs.writeFileSync(abs, text, 'utf8');
      const rel = `subs/${episodeId}/${destName}`;
      const r = db
        .prepare(
          `INSERT INTO episode_subtitles (episodeId, label, lang, path) VALUES (?, ?, ?, ?)`,
        )
        .run(episodeId, String(label), String(lang), rel);
      return {
        ok: true,
        id: Number(r.lastInsertRowid),
        label: String(label),
        lang: String(lang),
        url: `/media/${rel}`,
      };
    },
  );

  app.delete<{ Params: { id: string; subId: string } }>(
    '/api/admin/episodes/:id/subtitles/:subId',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const db = getDb();
      const row = db
        .prepare(`SELECT * FROM episode_subtitles WHERE id = ? AND episodeId = ?`)
        .get(Number(req.params.subId), Number(req.params.id)) as
        | { id: number; path: string }
        | undefined;
      if (!row) return reply.code(404).send({ error: 'Not found' });
      db.prepare(`DELETE FROM episode_subtitles WHERE id = ?`).run(row.id);
      const abs = path.join(config.mediaRoot, row.path.replace(/^\/?media\//, ''));
      try {
        if (fs.existsSync(abs)) fs.unlinkSync(abs);
      } catch {
        /* ignore */
      }
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/episodes/:id/subtitles',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const ep = getDb()
        .prepare(`SELECT id FROM episodes WHERE id = ? AND deletedAt IS NULL`)
        .get(episodeId);
      if (!ep) return reply.code(404).send({ error: 'Episode not found' });
      return { items: getSubtitlesForEpisode(getDb(), episodeId) };
    },
  );

  /** Attach alternate audio file (AAC/MP3/WAV/M4A/…) → packaged into HLS audio group when ready. */
  app.post<{ Params: { id: string } }>(
    '/api/admin/episodes/:id/audio',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const db = getDb();
      const episode = db
        .prepare(`SELECT id, statusEncode FROM episodes WHERE id = ? AND deletedAt IS NULL`)
        .get(episodeId) as { id: number; statusEncode: string } | undefined;
      if (!episode) return reply.code(404).send({ error: 'Episode not found' });

      const file = await req.file();
      if (!file) return reply.code(400).send({ error: 'No file uploaded' });
      const lower = file.filename.toLowerCase();
      if (!/\.(aac|m4a|mp3|wav|ogg|flac|mp4|mkv)$/.test(lower)) {
        return reply.code(400).send({ error: 'Unsupported audio container' });
      }

      const fields = file.fields as Record<string, { value?: string } | undefined>;
      const label =
        (typeof fields?.label === 'object' && fields.label?.value) ||
        req.headers['x-audio-label'] ||
        'Audio phụ';
      const lang =
        (typeof fields?.lang === 'object' && fields.lang?.value) ||
        req.headers['x-audio-lang'] ||
        'und';

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const audioDir = path.join(config.mediaRoot, 'audio-src', String(episodeId));
      fs.mkdirSync(audioDir, { recursive: true });
      const destName = `${Date.now()}${path.extname(file.filename) || '.m4a'}`;
      const abs = path.join(audioDir, destName);
      fs.writeFileSync(abs, Buffer.concat(chunks));

      const r = db
        .prepare(
          `INSERT INTO episode_audio_tracks (episodeId, label, lang, sourcePath) VALUES (?, ?, ?, ?)`,
        )
        .run(episodeId, String(label), String(lang), abs);

      let tracks: unknown[] = [];
      if (episode.statusEncode === 'ready') {
        try {
          tracks = await attachAudioTrackToReadyHls(
            episodeId,
            abs,
            String(label),
            String(lang),
          );
        } catch (err) {
          return reply.code(500).send({
            error: err instanceof Error ? err.message : 'Audio package failed',
            id: Number(r.lastInsertRowid),
          });
        }
      }

      return {
        ok: true,
        id: Number(r.lastInsertRowid),
        label: String(label),
        lang: String(lang),
        packaged: episode.statusEncode === 'ready',
        tracks,
        note:
          episode.statusEncode === 'ready'
            ? 'Đã gắn vào HLS master'
            : 'Sẽ đóng gói khi encode xong (hoặc upload lại video)',
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/episodes/:id/audio',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT id, label, lang, sourcePath, createdAt FROM episode_audio_tracks WHERE episodeId = ? ORDER BY id`,
        )
        .all(episodeId);
      const hlsMetaPath = path.join(config.hlsDir, String(episodeId), 'audio-tracks.json');
      let hlsTracks: unknown[] = [];
      if (fs.existsSync(hlsMetaPath)) {
        try {
          hlsTracks = JSON.parse(fs.readFileSync(hlsMetaPath, 'utf8')) as unknown[];
        } catch {
          hlsTracks = [];
        }
      }
      return { items: rows, hlsTracks };
    },
  );

  /** Resumable chunked upload: init → PUT parts → complete → enqueue encode */
  app.post<{ Params: { id: string } }>(
    '/api/admin/episodes/:id/upload/init',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const schema = z.object({
        filename: z.string().min(1),
        size: z.coerce.number().int().positive().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
      const ep = getDb()
        .prepare(`SELECT id FROM episodes WHERE id = ? AND deletedAt IS NULL`)
        .get(episodeId);
      if (!ep) return reply.code(404).send({ error: 'Episode not found' });
      const uploadId = `${episodeId}-${Date.now()}`;
      const dir = path.join(config.uploadsDir, 'chunks', uploadId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'meta.json'),
        JSON.stringify({
          episodeId,
          filename: parsed.data.filename,
          size: parsed.data.size ?? null,
          parts: [],
        }),
        'utf8',
      );
      return { uploadId, episodeId };
    },
  );

  app.put<{ Params: { id: string; uploadId: string; part: string } }>(
    '/api/admin/episodes/:id/upload/:uploadId/:part',
    {
      // Accept raw binary / octet-stream for chunk bodies
      bodyLimit: 1024 * 1024 * 64,
    },
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const uploadId = req.params.uploadId;
      const part = Number(req.params.part);
      if (!Number.isFinite(part) || part < 0) return reply.code(400).send({ error: 'bad part' });
      const dir = path.join(config.uploadsDir, 'chunks', uploadId);
      const metaPath = path.join(dir, 'meta.json');
      if (!fs.existsSync(metaPath)) return reply.code(404).send({ error: 'Upload session not found' });
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
        episodeId: number;
        parts: number[];
      };
      if (meta.episodeId !== episodeId) return reply.code(400).send({ error: 'episode mismatch' });
      const dest = path.join(dir, `part-${String(part).padStart(5, '0')}`);
      let buf: Buffer;
      if (Buffer.isBuffer(req.body)) {
        buf = req.body;
      } else if (typeof req.body === 'string') {
        buf = Buffer.from(req.body);
      } else {
        const chunks: Buffer[] = [];
        await new Promise<void>((resolve, reject) => {
          req.raw.on('data', (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
          req.raw.on('end', () => resolve());
          req.raw.on('error', reject);
        });
        buf = Buffer.concat(chunks);
      }
      if (!buf.length) return reply.code(400).send({ error: 'Empty part body' });
      fs.writeFileSync(dest, buf);

      if (!meta.parts.includes(part)) meta.parts.push(part);
      meta.parts.sort((a, b) => a - b);
      fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
      return { ok: true, part, received: meta.parts.length, bytes: buf.length };
    },
  );

  app.post<{ Params: { id: string; uploadId: string } }>(
    '/api/admin/episodes/:id/upload/:uploadId/complete',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      const episodeId = Number(req.params.id);
      const uploadId = req.params.uploadId;
      const dir = path.join(config.uploadsDir, 'chunks', uploadId);
      const metaPath = path.join(dir, 'meta.json');
      if (!fs.existsSync(metaPath)) return reply.code(404).send({ error: 'Upload session not found' });
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
        episodeId: number;
        filename: string;
        parts: number[];
      };
      if (meta.episodeId !== episodeId) return reply.code(400).send({ error: 'episode mismatch' });
      if (!meta.parts.length) return reply.code(400).send({ error: 'No parts uploaded' });
      const ext = path.extname(meta.filename) || '.mp4';
      const dest = path.join(config.uploadsDir, `ep-${episodeId}-${Date.now()}${ext}`);
      const out = fs.createWriteStream(dest);
      for (const p of meta.parts) {
        const partPath = path.join(dir, `part-${String(p).padStart(5, '0')}`);
        if (!fs.existsSync(partPath)) {
          return reply.code(400).send({ error: `Missing part ${p}` });
        }
        await new Promise<void>((resolve, reject) => {
          const rs = fs.createReadStream(partPath);
          rs.pipe(out, { end: false });
          rs.on('end', resolve);
          rs.on('error', reject);
        });
      }
      out.end();
      await new Promise<void>((resolve, reject) => {
        out.on('finish', resolve);
        out.on('error', reject);
      });
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      const db = getDb();
      db.prepare(
        `UPDATE episodes SET sourcePath = ?, statusEncode = 'queued', hlsPath = NULL, hlsStorage = 'local', updatedAt = datetime('now') WHERE id = ?`,
      ).run(dest, episodeId);
      const jobId = createEncodeJob(episodeId);
      return { ok: true, episodeId, jobId, sourcePath: dest };
    },
  );

  app.get<{ Params: { id: string } }>('/api/admin/jobs/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const job = getDb()
      .prepare(`SELECT * FROM encode_jobs WHERE id = ?`)
      .get(Number(req.params.id));
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return job;
  });

  app.get('/api/admin/jobs', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const items = getDb()
      .prepare(`SELECT * FROM encode_jobs ORDER BY id DESC LIMIT 50`)
      .all();
    return { items };
  });

  app.get('/api/admin/playback-stats', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const q = req.query as { since?: string };
    const sinceHours = Math.min(168, Math.max(1, Number(q.since ?? 24) || 24));
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT pe.episodeId, e.number AS episodeNumber, s.title AS seriesTitle,
               pe.type,
               COUNT(*) AS eventCount,
               AVG(pe.durationMs) AS avgDurationMs
        FROM playback_events pe
        LEFT JOIN episodes e ON e.id = pe.episodeId
        LEFT JOIN series s ON s.id = e.seriesId
        WHERE pe.createdAt >= datetime('now', ?)
        GROUP BY pe.episodeId, pe.type
        ORDER BY eventCount DESC
        LIMIT 100
      `,
      )
      .all(`-${sinceHours} hours`);
    const totals = db
      .prepare(
        `
        SELECT type, COUNT(*) AS c, AVG(durationMs) AS avgMs
        FROM playback_events
        WHERE createdAt >= datetime('now', ?)
        GROUP BY type
      `,
      )
      .all(`-${sinceHours} hours`);
    return { sinceHours, totals, items: rows };
  });

  app.get('/api/admin/comments/flagged', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const items = getDb()
      .prepare(
        `
        SELECT c.id, c.body, c.flagCount, c.hiddenAt, c.episodeId, c.createdAt,
               u.displayName, e.number AS episodeNumber, s.title AS seriesTitle
        FROM comments c
        JOIN users u ON u.id = c.userId
        JOIN episodes e ON e.id = c.episodeId
        JOIN series s ON s.id = e.seriesId
        WHERE c.deletedAt IS NULL AND (c.flagCount > 0 OR c.hiddenAt IS NOT NULL)
        ORDER BY c.flagCount DESC, c.id DESC
        LIMIT 50
      `,
      )
      .all();
    return { items };
  });

  app.post<{ Params: { id: string } }>('/api/admin/comments/:id/hide', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const id = Number(req.params.id);
    const r = getDb()
      .prepare(`UPDATE comments SET hiddenAt = datetime('now') WHERE id = ? AND deletedAt IS NULL`)
      .run(id);
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/admin/comments/:id/unhide', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const id = Number(req.params.id);
    const r = getDb()
      .prepare(`UPDATE comments SET hiddenAt = NULL WHERE id = ? AND deletedAt IS NULL`)
      .run(id);
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/admin/comments/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const id = Number(req.params.id);
    const r = getDb()
      .prepare(`UPDATE comments SET deletedAt = datetime('now') WHERE id = ? AND deletedAt IS NULL`)
      .run(id);
    if (r.changes === 0) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.get('/api/admin/disk-usage', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const du = (dir: string) => {
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
    };
    const hlsBytes = du(config.hlsDir);
    const uploadsBytes = du(config.uploadsDir);
    return {
      hlsBytes,
      uploadsBytes,
      totalBytes: hlsBytes + uploadsBytes,
      hlsDir: config.hlsDir,
      uploadsDir: config.uploadsDir,
      r2Configured: isR2Configured(),
      r2PublishMode: config.r2PublishMode,
    };
  });

  /** Dry-run or delete local HLS for episodes already on R2 (SCL-010). */
  app.post('/api/admin/hls/cleanup-local', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = z
      .object({
        dryRun: z.boolean().optional().default(true),
        minAgeHours: z.coerce.number().int().min(0).max(24 * 365).optional().default(24),
        episodeIds: z.array(z.coerce.number().int().positive()).optional(),
        verifyUrl: z.boolean().optional().default(false),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });
    const result = await cleanupLocalHlsAfterR2(body.data);
    return { ok: true, ...result };
  });

  /** Manually publish an episode HLS tree to R2 (SCL-008). */
  app.post<{ Params: { id: string } }>(
    '/api/admin/episodes/:id/publish-r2',
    async (req, reply) => {
      if (!(await requireEditor(req, reply))) return;
      if (!isR2Configured()) {
        return reply.code(400).send({ error: 'R2 is not configured' });
      }
      const id = Number(req.params.id);
      const ep = getDb()
        .prepare(
          `SELECT id, statusEncode FROM episodes WHERE id = ? AND deletedAt IS NULL`,
        )
        .get(id) as { id: number; statusEncode: string } | undefined;
      if (!ep) return reply.code(404).send({ error: 'Not found' });
      if (ep.statusEncode !== 'ready') {
        return reply.code(400).send({ error: 'Episode HLS not ready' });
      }
      const result = await publishEpisodeHlsToR2(id, { force: true });
      if (!result.ok) return reply.code(502).send(result);
      return result;
    },
  );

  app.post('/api/admin/jobs/purge', async (req, reply) => {
    if (!(await requireAdmin(req, reply))) return;
    const body = z
      .object({ olderThanDays: z.coerce.number().int().min(1).max(365).default(30) })
      .safeParse(req.body ?? {});
    const days = body.success ? body.data.olderThanDays : 30;
    const r = getDb()
      .prepare(
        `DELETE FROM encode_jobs
         WHERE status IN ('ready', 'failed')
           AND COALESCE(finishedAt, createdAt) < datetime('now', ?)`,
      )
      .run(`-${days} days`);
    return { ok: true, deleted: r.changes, olderThanDays: days };
  });

  /** Re-queue a failed encode using the episode's existing sourcePath (no new upload). */
  app.post<{ Params: { id: string } }>('/api/admin/jobs/:id/retry', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const db = getDb();
    const jobId = Number(req.params.id);
    const job = db.prepare(`SELECT * FROM encode_jobs WHERE id = ?`).get(jobId) as
      | { id: number; episodeId: number; status: string }
      | undefined;
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (job.status !== 'failed') {
      return reply.code(400).send({ error: 'Only failed jobs can be retried' });
    }
    const episode = db
      .prepare(`SELECT id, sourcePath FROM episodes WHERE id = ? AND deletedAt IS NULL`)
      .get(job.episodeId) as { id: number; sourcePath: string | null } | undefined;
    if (!episode?.sourcePath || !fs.existsSync(episode.sourcePath)) {
      return reply.code(400).send({ error: 'Source file missing; re-upload required' });
    }
    db.prepare(
      `UPDATE encode_jobs SET status = 'queued', progress = 0, error = NULL, finishedAt = NULL WHERE id = ?`,
    ).run(jobId);
    db.prepare(
      `UPDATE episodes SET statusEncode = 'queued', hlsStorage = 'local', updatedAt = datetime('now') WHERE id = ?`,
    ).run(job.episodeId);
    if (process.env.ENCODE_IN_PROCESS !== '0') {
      encodeQueue.enqueueJob(jobId);
    }
    const updated = db.prepare(`SELECT * FROM encode_jobs WHERE id = ?`).get(jobId);
    return { ok: true, job: updated };
  });

  /** Remove a finished job from admin lists. Does not delete HLS if episode is still ready. */
  app.delete<{ Params: { id: string } }>('/api/admin/jobs/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const db = getDb();
    const jobId = Number(req.params.id);
    const job = db.prepare(`SELECT * FROM encode_jobs WHERE id = ?`).get(jobId) as
      | { id: number; status: string }
      | undefined;
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (job.status !== 'failed' && job.status !== 'ready') {
      return reply.code(400).send({ error: 'Only failed or ready jobs can be cleared' });
    }
    db.prepare(`DELETE FROM encode_jobs WHERE id = ?`).run(jobId);
    return { ok: true };
  });

  // ——— Schedule ———
  app.get('/api/admin/schedule', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const items = getDb()
      .prepare(
        `
        SELECT sch.*, s.title AS seriesTitle, s.slug AS seriesSlug
        FROM schedule sch
        JOIN series s ON s.id = sch.seriesId
        WHERE sch.deletedAt IS NULL
        ORDER BY sch.weekday, s.title
      `,
      )
      .all();
    return { items };
  });

  app.post('/api/admin/schedule', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const schema = z.object({
      seriesId: z.coerce.number().int().positive(),
      weekday: z.coerce.number().int().min(0).max(6),
      note: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const r = getDb()
      .prepare(`INSERT INTO schedule (seriesId, weekday, note) VALUES (?, ?, ?)`)
      .run(parsed.data.seriesId, parsed.data.weekday, parsed.data.note ?? '');
    return { id: Number(r.lastInsertRowid), ...parsed.data };
  });

  app.put<{ Params: { id: string } }>('/api/admin/schedule/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    const schema = z.object({
      seriesId: z.coerce.number().int().positive().optional(),
      weekday: z.coerce.number().int().min(0).max(6).optional(),
      note: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const id = Number(req.params.id);
    const d = parsed.data;
    getDb()
      .prepare(
        `UPDATE schedule SET
          seriesId = COALESCE(?, seriesId),
          weekday = COALESCE(?, weekday),
          note = COALESCE(?, note)
         WHERE id = ?`,
      )
      .run(d.seriesId ?? null, d.weekday ?? null, d.note ?? null, id);
    return getDb().prepare(`SELECT * FROM schedule WHERE id = ?`).get(id);
  });

  app.delete<{ Params: { id: string } }>('/api/admin/schedule/:id', async (req, reply) => {
    if (!(await requireEditor(req, reply))) return;
    getDb()
      .prepare(`UPDATE schedule SET deletedAt = datetime('now') WHERE id = ?`)
      .run(Number(req.params.id));
    return { ok: true };
  });
}
