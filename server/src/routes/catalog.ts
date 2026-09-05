import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import {
  getGenresForSeries,
  getRatingAgg,
  getSubtitlesForEpisode,
  mapEpisode,
  mapSeries,
  parseCast,
  slugifyPerson,
  type EpisodeRow,
  type SeriesRow,
} from '../lib/mappers.js';

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/home', async (req) => {
    const db = getDb();

    // Hot / hero: only series with real views. isHot is a badge boost, not enough alone.
    const hotRows = db
      .prepare(
        `SELECT * FROM series
         WHERE deletedAt IS NULL AND viewCount > 0
         ORDER BY CASE WHEN isHot = 1 THEN 0 ELSE 1 END,
                  viewCount DESC, rankingScore DESC
         LIMIT 8`,
      )
      .all() as SeriesRow[];

    const latestRows = db
      .prepare(
        `SELECT * FROM series WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 12`,
      )
      .all() as SeriesRow[];

    const weekday = new Date().getDay();
    const scheduleToday = db
      .prepare(
        `
        SELECT s.*, sch.weekday, sch.note AS scheduleNote
        FROM schedule sch
        JOIN series s ON s.id = sch.seriesId
        WHERE sch.deletedAt IS NULL AND s.deletedAt IS NULL AND sch.weekday = ?
        ORDER BY s.title
      `,
      )
      .all(weekday) as (SeriesRow & { weekday: number; scheduleNote: string })[];

    const rankingRows = db
      .prepare(
        `SELECT * FROM series WHERE deletedAt IS NULL
         ORDER BY viewCount DESC, rankingScore DESC LIMIT 10`,
      )
      .all() as SeriesRow[];

    let continueWatching: unknown[] = [];
    try {
      await req.jwtVerify();
      const userId = req.user.sub;
      const rows = db
        .prepare(
          `
          SELECT wh.positionSec, wh.updatedAt AS watchedAt,
                 e.*, s.slug AS seriesSlug, s.title AS seriesTitle, s.posterUrl AS seriesPosterUrl
          FROM watch_history wh
          JOIN episodes e ON e.id = wh.episodeId
          JOIN series s ON s.id = e.seriesId
          WHERE wh.userId = ? AND e.deletedAt IS NULL AND s.deletedAt IS NULL
            AND wh.positionSec > 5
            AND (
              e.durationSec IS NULL OR e.durationSec <= 0
              OR wh.positionSec < (e.durationSec * 0.95)
            )
          ORDER BY wh.updatedAt DESC
          LIMIT 12
        `,
        )
        .all(userId) as (EpisodeRow & {
        positionSec: number;
        watchedAt: string;
        seriesSlug: string;
        seriesTitle: string;
        seriesPosterUrl: string | null;
      })[];
      continueWatching = rows.map((r) => ({
        ...mapEpisode(r),
        positionSec: r.positionSec,
        watchedAt: r.watchedAt,
        series: {
          slug: r.seriesSlug,
          title: r.seriesTitle,
          posterUrl: r.seriesPosterUrl,
        },
      }));
    } catch {
      // anonymous
    }

    const hydrate = (rows: SeriesRow[]) =>
      rows.map((r) =>
        mapSeries(r, getGenresForSeries(db, r.id), getRatingAgg(db, r.id)),
      );

    return {
      hot: hydrate(hotRows),
      latest: hydrate(latestRows),
      scheduleToday: scheduleToday.map((r) =>
        mapSeries(r, getGenresForSeries(db, r.id), {
          weekday: r.weekday,
          scheduleNote: r.scheduleNote,
          ...getRatingAgg(db, r.id),
        }),
      ),
      ranking: hydrate(rankingRows),
      continueWatching,
    };
  });

  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      status?: string;
      genre?: string;
      year?: string;
      country?: string;
      q?: string;
      kind?: string;
      sort?: string;
      tag?: string;
      preset?: string;
    };
  }>('/api/series', async (req) => {
    const db = getDb();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(48, Math.max(1, Number(req.query.limit ?? 24)));
    const offset = (page - 1) * limit;

    const where: string[] = ['s.deletedAt IS NULL'];
    const params: unknown[] = [];

    if (req.query.status === 'ongoing' || req.query.status === 'completed') {
      where.push('s.status = ?');
      params.push(req.query.status);
    }
    if (req.query.kind === 'movie' || req.query.kind === 'series') {
      where.push(`COALESCE(s.kind, 'series') = ?`);
      params.push(req.query.kind);
    }
    if (req.query.year) {
      where.push('s.year = ?');
      params.push(Number(req.query.year));
    }
    if (req.query.country) {
      where.push('s.country LIKE ?');
      params.push(`%${req.query.country}%`);
    }
    if (req.query.genre) {
      where.push(
        `EXISTS (SELECT 1 FROM series_genres sg JOIN genres g ON g.id = sg.genreId WHERE sg.seriesId = s.id AND g.slug = ?)`,
      );
      params.push(req.query.genre);
    }
    if (req.query.tag) {
      where.push(`s.tagsJson LIKE ?`);
      params.push(`%${req.query.tag}%`);
    }
    // COMP-015 special presets (config map)
    const preset = (req.query.preset ?? '').trim().toLowerCase();
    if (preset === 'anime') {
      where.push(
        `(s.country LIKE ? OR EXISTS (SELECT 1 FROM series_genres sg JOIN genres g ON g.id = sg.genreId WHERE sg.seriesId = s.id AND g.slug IN ('anime','hoat-hinh')) OR s.tagsJson LIKE ?)`,
      );
      params.push('%Nhật%', '%anime%');
    } else if (preset === 'k-drama' || preset === 'kdrama') {
      where.push(`(s.country LIKE ? OR s.tagsJson LIKE ?)`);
      params.push('%Hàn%', '%k-drama%');
    } else if (preset === 'c-drama' || preset === 'cdrama') {
      where.push(`(s.country LIKE ? OR s.tagsJson LIKE ?)`);
      params.push('%Trung%', '%c-drama%');
    }
    if (req.query.q) {
      where.push('(s.title LIKE ? OR s.synopsis LIKE ? OR s.tagline LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like);
    }

    const sort = (req.query.sort ?? 'updated').toLowerCase();
    let orderSql = 's.updatedAt DESC';
    if (sort === 'views' || sort === 'viewcount') orderSql = 's.viewCount DESC, s.rankingScore DESC';
    else if (sort === 'year') orderSql = 's.year DESC NULLS LAST, s.updatedAt DESC';
    else if (sort === 'title') orderSql = 's.title COLLATE NOCASE ASC';
    else if (sort === 'rating') {
      orderSql = `(SELECT AVG(score) FROM ratings r WHERE r.seriesId = s.id) DESC NULLS LAST, s.viewCount DESC`;
    } else if (sort === 'oldest') orderSql = 's.year ASC NULLS LAST, s.createdAt ASC';

    // SQLite doesn't support NULLS LAST — emulate
    orderSql = orderSql
      .replace('s.year DESC NULLS LAST', 'CASE WHEN s.year IS NULL THEN 1 ELSE 0 END, s.year DESC')
      .replace('s.year ASC NULLS LAST', 'CASE WHEN s.year IS NULL THEN 1 ELSE 0 END, s.year ASC')
      .replace(
        '(SELECT AVG(score) FROM ratings r WHERE r.seriesId = s.id) DESC NULLS LAST',
        'CASE WHEN (SELECT COUNT(*) FROM ratings r WHERE r.seriesId = s.id) = 0 THEN 1 ELSE 0 END, (SELECT AVG(score) FROM ratings r WHERE r.seriesId = s.id) DESC',
      );

    const whereSql = where.join(' AND ');
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM series s WHERE ${whereSql}`).get(...params) as {
        c: number;
      }
    ).c;

    const rows = db
      .prepare(
        `SELECT s.* FROM series s WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as SeriesRow[];

    return {
      page,
      limit,
      total,
      items: rows.map((r) =>
        mapSeries(r, getGenresForSeries(db, r.id), getRatingAgg(db, r.id)),
      ),
    };
  });

  app.get<{ Params: { slug: string } }>('/api/series/:slug', async (req, reply) => {
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM series WHERE slug = ? AND deletedAt IS NULL`)
      .get(req.params.slug) as SeriesRow | undefined;
    if (!row) return reply.code(404).send({ error: 'Series not found' });

    let userId: number | undefined;
    try {
      await req.jwtVerify();
      userId = req.user.sub;
    } catch {
      /* anonymous */
    }

    const episodes = db
      .prepare(
        `SELECT * FROM episodes WHERE seriesId = ? AND deletedAt IS NULL
         ORDER BY COALESCE(seasonNumber, 1) ASC, number ASC`,
      )
      .all(row.id) as EpisodeRow[];

    return {
      ...mapSeries(row, getGenresForSeries(db, row.id), getRatingAgg(db, row.id, userId)),
      episodes: episodes.map((e) =>
        mapEpisode(e, { subtitles: getSubtitlesForEpisode(db, e.id) }),
      ),
      episodeCount: episodes.length,
    };
  });

  app.get<{ Params: { slug: string }; Querystring: { limit?: string } }>(
    '/api/series/:slug/related',
    async (req, reply) => {
      const db = getDb();
      const row = db
        .prepare(`SELECT id FROM series WHERE slug = ? AND deletedAt IS NULL`)
        .get(req.params.slug) as { id: number } | undefined;
      if (!row) return reply.code(404).send({ error: 'Series not found' });
      const limit = Math.min(24, Math.max(1, Number(req.query.limit ?? 12)));
      const genreIds = (
        db
          .prepare(`SELECT genreId FROM series_genres WHERE seriesId = ?`)
          .all(row.id) as { genreId: number }[]
      ).map((g) => g.genreId);
      let related: SeriesRow[] = [];
      if (genreIds.length) {
        const placeholders = genreIds.map(() => '?').join(',');
        related = db
          .prepare(
            `
            SELECT s.*, COUNT(sg.genreId) AS overlap
            FROM series s
            JOIN series_genres sg ON sg.seriesId = s.id
            WHERE s.deletedAt IS NULL AND s.id != ?
              AND sg.genreId IN (${placeholders})
            GROUP BY s.id
            ORDER BY overlap DESC, s.viewCount DESC
            LIMIT ?
          `,
          )
          .all(row.id, ...genreIds, limit) as SeriesRow[];
      }
      return {
        items: related.map((r) =>
          mapSeries(r, getGenresForSeries(db, r.id), getRatingAgg(db, r.id)),
        ),
      };
    },
  );

  app.get<{ Params: { slug: string } }>('/api/series/:slug/episodes', async (req, reply) => {
    const db = getDb();
    const series = db
      .prepare(`SELECT id FROM series WHERE slug = ? AND deletedAt IS NULL`)
      .get(req.params.slug) as { id: number } | undefined;
    if (!series) return reply.code(404).send({ error: 'Series not found' });

    const episodes = db
      .prepare(
        `SELECT * FROM episodes WHERE seriesId = ? AND deletedAt IS NULL
         ORDER BY COALESCE(seasonNumber, 1) ASC, number ASC`,
      )
      .all(series.id) as EpisodeRow[];

    return {
      items: episodes.map((e) =>
        mapEpisode(e, { subtitles: getSubtitlesForEpisode(db, e.id) }),
      ),
    };
  });

  app.get<{ Params: { personSlug: string } }>('/api/people/:personSlug', async (req, reply) => {
    const db = getDb();
    const personSlug = req.params.personSlug.toLowerCase();
    const rows = db
      .prepare(`SELECT * FROM series WHERE deletedAt IS NULL AND castJson != '' AND castJson != '[]'`)
      .all() as SeriesRow[];
    const matched: SeriesRow[] = [];
    let personName = personSlug;
    for (const r of rows) {
      const cast = parseCast(r.castJson);
      const hit = cast.find((c) => {
        const s = (c.slug || slugifyPerson(c.name)).toLowerCase();
        return s === personSlug;
      });
      if (hit) {
        matched.push(r);
        personName = hit.name;
      }
    }
    if (!matched.length) return reply.code(404).send({ error: 'Person not found' });
    return {
      slug: personSlug,
      name: personName,
      items: matched.map((r) =>
        mapSeries(r, getGenresForSeries(db, r.id), getRatingAgg(db, r.id)),
      ),
    };
  });

  app.get('/sitemap.xml', async (_req, reply) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT slug FROM series WHERE deletedAt IS NULL ORDER BY updatedAt DESC LIMIT 5000`,
      )
      .all() as { slug: string }[];
    const base = String(config.corsOrigin || 'http://localhost:5173').replace(/\/$/, '');
    const urls = [
      '',
      '/moi-cap-nhat',
      '/top',
      '/lich-chieu',
      '/tim-kiem',
      '/gioi-thieu',
      '/lien-he',
      ...rows.map((r) => `/phim/${r.slug}`),
    ];
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n')}
</urlset>`;
    return reply.type('application/xml').send(body);
  });

  app.get('/api/genres', async () => {
    const items = getDb()
      .prepare(`SELECT id, name, slug FROM genres ORDER BY name`)
      .all();
    return { items };
  });

  app.get<{
    Querystring: {
      q?: string;
      page?: string;
      limit?: string;
      kind?: string;
      genre?: string;
      year?: string;
      country?: string;
      status?: string;
      sort?: string;
    };
  }>('/api/search', async (req) => {
      const q = (req.query.q ?? '').trim();
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(48, Math.max(1, Number(req.query.limit ?? 24)));
      const offset = (page - 1) * limit;
      const db = getDb();

      const where: string[] = ['s.deletedAt IS NULL'];
      const params: unknown[] = [];
      if (q) {
        where.push('(s.title LIKE ? OR s.synopsis LIKE ? OR s.country LIKE ? OR s.tagline LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like);
      }
      if (req.query.kind === 'movie' || req.query.kind === 'series') {
        where.push(`COALESCE(s.kind, 'series') = ?`);
        params.push(req.query.kind);
      }
      if (req.query.status === 'ongoing' || req.query.status === 'completed') {
        where.push('s.status = ?');
        params.push(req.query.status);
      }
      if (req.query.year) {
        where.push('s.year = ?');
        params.push(Number(req.query.year));
      }
      if (req.query.country) {
        where.push('s.country LIKE ?');
        params.push(`%${req.query.country}%`);
      }
      if (req.query.genre) {
        where.push(
          `EXISTS (SELECT 1 FROM series_genres sg JOIN genres g ON g.id = sg.genreId WHERE sg.seriesId = s.id AND g.slug = ?)`,
        );
        params.push(req.query.genre);
      }

      const sort = (req.query.sort ?? (q ? 'relevance' : 'updated')).toLowerCase();
      let orderSql = 's.updatedAt DESC';
      if (sort === 'views') orderSql = 's.viewCount DESC';
      else if (sort === 'year')
        orderSql = 'CASE WHEN s.year IS NULL THEN 1 ELSE 0 END, s.year DESC';
      else if (sort === 'title') orderSql = 's.title COLLATE NOCASE ASC';
      else if (sort === 'rating')
        orderSql =
          'CASE WHEN (SELECT COUNT(*) FROM ratings r WHERE r.seriesId = s.id) = 0 THEN 1 ELSE 0 END, (SELECT AVG(score) FROM ratings r WHERE r.seriesId = s.id) DESC';
      else if (q) orderSql = 's.viewCount DESC, s.rankingScore DESC';

      const whereSql = where.join(' AND ');
      if (!q && !req.query.genre && !req.query.year && !req.query.kind && !req.query.country && !req.query.status) {
        return { page, limit, total: 0, items: [] };
      }

      const total = (
        db.prepare(`SELECT COUNT(*) AS c FROM series s WHERE ${whereSql}`).get(...params) as {
          c: number;
        }
      ).c;

      const rows = db
        .prepare(
          `SELECT s.* FROM series s WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset) as SeriesRow[];

      return {
        page,
        limit,
        total,
        items: rows.map((r) =>
          mapSeries(r, getGenresForSeries(db, r.id), getRatingAgg(db, r.id)),
        ),
      };
    },
  );

  app.get<{ Querystring: { weekday?: string } }>('/api/schedule', async (req) => {
    const db = getDb();
    const params: unknown[] = [];
    let weekdayFilter = '';
    if (req.query.weekday !== undefined && req.query.weekday !== '') {
      weekdayFilter = 'AND sch.weekday = ?';
      params.push(Number(req.query.weekday));
    }

    const rows = db
      .prepare(
        `
        SELECT sch.id AS scheduleId, sch.weekday, sch.note AS scheduleNote, s.*
        FROM schedule sch
        JOIN series s ON s.id = sch.seriesId
        WHERE sch.deletedAt IS NULL AND s.deletedAt IS NULL ${weekdayFilter}
        ORDER BY sch.weekday, s.title
      `,
      )
      .all(...params) as (SeriesRow & {
      scheduleId: number;
      weekday: number;
      scheduleNote: string;
    })[];

    const byWeekday: Record<string, unknown[]> = {};
    for (let d = 0; d <= 6; d++) byWeekday[String(d)] = [];

    for (const r of rows) {
      byWeekday[String(r.weekday)].push(
        mapSeries(r, getGenresForSeries(db, r.id), {
          scheduleId: r.scheduleId,
          weekday: r.weekday,
          scheduleNote: r.scheduleNote,
        }),
      );
    }

    return {
      byWeekday,
      items: rows.map((r) =>
        mapSeries(r, getGenresForSeries(db, r.id), {
          scheduleId: r.scheduleId,
          weekday: r.weekday,
          scheduleNote: r.scheduleNote,
        }),
      ),
    };
  });

  app.get<{ Querystring: { limit?: string } }>('/api/ranking', async (req) => {
    const db = getDb();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const rows = db
      .prepare(
        `SELECT * FROM series WHERE deletedAt IS NULL
         ORDER BY viewCount DESC, rankingScore DESC, updatedAt DESC LIMIT ?`,
      )
      .all(limit) as SeriesRow[];
    return {
      items: rows.map((r, i) =>
        mapSeries(r, getGenresForSeries(db, r.id), {
          rank: i + 1,
          ...getRatingAgg(db, r.id),
        }),
      ),
    };
  });

  app.get<{ Querystring: { page?: string; limit?: string } }>('/api/completed', async (req) => {
    const db = getDb();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(48, Math.max(1, Number(req.query.limit ?? 24)));
    const offset = (page - 1) * limit;

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM series WHERE deletedAt IS NULL AND status = 'completed'`,
        )
        .get() as { c: number }
    ).c;

    const rows = db
      .prepare(
        `SELECT * FROM series WHERE deletedAt IS NULL AND status = 'completed'
         ORDER BY updatedAt DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as SeriesRow[];

    return {
      page,
      limit,
      total,
      items: rows.map((r) =>
        mapSeries(r, getGenresForSeries(db, r.id), getRatingAgg(db, r.id)),
      ),
    };
  });

  /** Increment view counts when playback actually starts (24h dedupe per viewerKey). */
  app.post<{ Params: { id: string } }>('/api/episodes/:id/view', async (req, reply) => {
    const episodeId = Number(req.params.id);
    const db = getDb();
    const episode = db
      .prepare(`SELECT id, seriesId, viewCount FROM episodes WHERE id = ? AND deletedAt IS NULL`)
      .get(episodeId) as { id: number; seriesId: number; viewCount: number } | undefined;
    if (!episode) return reply.code(404).send({ error: 'Episode not found' });

    let viewerKey = (req.cookies as Record<string, string | undefined>)?.livestream_vid;
    if (!viewerKey || viewerKey.length < 8) {
      viewerKey = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      reply.setCookie('livestream_vid', viewerKey, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    const recent = db
      .prepare(
        `SELECT viewedAt FROM view_dedup
         WHERE viewerKey = ? AND episodeId = ?
           AND viewedAt > datetime('now', '-24 hours')`,
      )
      .get(viewerKey, episodeId) as { viewedAt: string } | undefined;

    if (recent) {
      const series = db
        .prepare(`SELECT viewCount FROM series WHERE id = ?`)
        .get(episode.seriesId) as { viewCount: number };
      const ep = db
        .prepare(`SELECT viewCount FROM episodes WHERE id = ?`)
        .get(episodeId) as { viewCount: number };
      return {
        ok: true,
        deduped: true,
        episodeId,
        episodeViewCount: ep.viewCount,
        seriesViewCount: series.viewCount,
      };
    }

    db.prepare(
      `INSERT INTO view_dedup (viewerKey, episodeId, viewedAt) VALUES (?, ?, datetime('now'))
       ON CONFLICT(viewerKey, episodeId) DO UPDATE SET viewedAt = datetime('now')`,
    ).run(viewerKey, episodeId);

    db.prepare(`UPDATE episodes SET viewCount = viewCount + 1 WHERE id = ?`).run(episodeId);
    db.prepare(
      `UPDATE series SET viewCount = viewCount + 1, rankingScore = viewCount + 1 WHERE id = ?`,
    ).run(episode.seriesId);

    const series = db
      .prepare(`SELECT viewCount FROM series WHERE id = ?`)
      .get(episode.seriesId) as { viewCount: number };
    const ep = db
      .prepare(`SELECT viewCount FROM episodes WHERE id = ?`)
      .get(episodeId) as { viewCount: number };

    return {
      ok: true,
      deduped: false,
      episodeId,
      episodeViewCount: ep.viewCount,
      seriesViewCount: series.viewCount,
    };
  });

  app.post<{ Params: { id: string } }>('/api/series/:id/rating', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const seriesId = Number(req.params.id);
    const parsed = z.object({ score: z.coerce.number().int().min(1).max(5) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'score must be 1–5' });

    const db = getDb();
    const series = db
      .prepare(`SELECT id FROM series WHERE id = ? AND deletedAt IS NULL`)
      .get(seriesId);
    if (!series) return reply.code(404).send({ error: 'Series not found' });

    db.prepare(
      `
      INSERT INTO ratings (userId, seriesId, score, updatedAt)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(userId, seriesId) DO UPDATE SET
        score = excluded.score,
        updatedAt = datetime('now')
    `,
    ).run(user.id, seriesId, parsed.data.score);

    return { ok: true, ...getRatingAgg(db, seriesId, user.id) };
  });
}
