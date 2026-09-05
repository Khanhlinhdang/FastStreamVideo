import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { getDb } from '../db/index.js';
import {
  getGenresForSeries,
  mapEpisode,
  mapSeries,
  type EpisodeRow,
  type SeriesRow,
} from '../lib/mappers.js';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me/favorites', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT s.* FROM favorites f
        JOIN series s ON s.id = f.seriesId
        WHERE f.userId = ? AND s.deletedAt IS NULL
        ORDER BY f.createdAt DESC
      `,
      )
      .all(user.id) as SeriesRow[];
    return { items: rows.map((r) => mapSeries(r, getGenresForSeries(db, r.id))) };
  });

  app.post<{ Body: { seriesId?: number | string; seriesSlug?: string } }>(
    '/api/me/favorites',
    async (req, reply) => {
      const user = await requireAuth(req, reply);
      if (!user) return;
      const db = getDb();

      let seriesId =
        req.body?.seriesId !== undefined && req.body?.seriesId !== ''
          ? Number(req.body.seriesId)
          : undefined;
      if (!seriesId && req.body?.seriesSlug) {
        const s = db
          .prepare(`SELECT id FROM series WHERE slug = ? AND deletedAt IS NULL`)
          .get(req.body.seriesSlug) as { id: number } | undefined;
        seriesId = s?.id;
      }
      if (!seriesId || !Number.isFinite(seriesId)) {
        return reply.code(400).send({ error: 'seriesId or seriesSlug required' });
      }

      const exists = db
        .prepare(`SELECT id FROM series WHERE id = ? AND deletedAt IS NULL`)
        .get(seriesId);
      if (!exists) return reply.code(404).send({ error: 'Series not found' });

      db.prepare(
        `INSERT OR IGNORE INTO favorites (userId, seriesId) VALUES (?, ?)`,
      ).run(user.id, seriesId);
      return { ok: true, seriesId };
    },
  );

  app.delete<{ Params: { seriesId: string } }>(
    '/api/me/favorites/:seriesId',
    async (req, reply) => {
      const user = await requireAuth(req, reply);
      if (!user) return;
      getDb()
        .prepare(`DELETE FROM favorites WHERE userId = ? AND seriesId = ?`)
        .run(user.id, Number(req.params.seriesId));
      return { ok: true };
    },
  );

  // DELETE with body or ?seriesId= query
  app.delete<{
    Body: { seriesId?: number | string };
    Querystring: { seriesId?: string };
  }>('/api/me/favorites', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const seriesId = Number(req.body?.seriesId ?? req.query?.seriesId);
    if (!Number.isFinite(seriesId) || seriesId <= 0) {
      return reply.code(400).send({ error: 'seriesId required' });
    }
    getDb()
      .prepare(`DELETE FROM favorites WHERE userId = ? AND seriesId = ?`)
      .run(user.id, seriesId);
    return { ok: true };
  });

  app.get('/api/me/history', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT wh.positionSec, wh.updatedAt AS watchedAt,
               e.*, s.slug AS seriesSlug, s.title AS seriesTitle, s.posterUrl AS seriesPosterUrl
        FROM watch_history wh
        JOIN episodes e ON e.id = wh.episodeId
        JOIN series s ON s.id = e.seriesId
        WHERE wh.userId = ? AND e.deletedAt IS NULL AND s.deletedAt IS NULL
        ORDER BY wh.updatedAt DESC
        LIMIT 50
      `,
      )
      .all(user.id) as (EpisodeRow & {
      positionSec: number;
      watchedAt: string;
      seriesSlug: string;
      seriesTitle: string;
      seriesPosterUrl: string | null;
    })[];

    return {
      items: rows.map((r) => ({
        ...mapEpisode(r),
        positionSec: r.positionSec,
        watchedAt: r.watchedAt,
        series: {
          slug: r.seriesSlug,
          title: r.seriesTitle,
          posterUrl: r.seriesPosterUrl,
        },
      })),
    };
  });

  app.put('/api/me/history', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const schema = z.object({
      episodeId: z.coerce.number().int().positive(),
      positionSec: z.coerce.number().min(0),
      /** Client clock ISO — last-write-wins vs stored updatedAt */
      clientUpdatedAt: z.string().datetime().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });

    const db = getDb();
    const ep = db
      .prepare(`SELECT id FROM episodes WHERE id = ? AND deletedAt IS NULL`)
      .get(parsed.data.episodeId);
    if (!ep) return reply.code(404).send({ error: 'Episode not found' });

    const existing = db
      .prepare(`SELECT positionSec, updatedAt FROM watch_history WHERE userId = ? AND episodeId = ?`)
      .get(user.id, parsed.data.episodeId) as
      | { positionSec: number; updatedAt: string }
      | undefined;

    if (existing && parsed.data.clientUpdatedAt) {
      const incoming = Date.parse(parsed.data.clientUpdatedAt);
      const stored = Date.parse(existing.updatedAt.includes('T') ? existing.updatedAt : `${existing.updatedAt}Z`);
      if (Number.isFinite(incoming) && Number.isFinite(stored) && incoming < stored) {
        return {
          ok: true,
          ignored: true,
          reason: 'stale',
          positionSec: existing.positionSec,
          updatedAt: existing.updatedAt,
        };
      }
    }

    db.prepare(
      `
      INSERT INTO watch_history (userId, episodeId, positionSec, updatedAt)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(userId, episodeId) DO UPDATE SET
        positionSec = excluded.positionSec,
        updatedAt = datetime('now')
    `,
    ).run(user.id, parsed.data.episodeId, parsed.data.positionSec);

    return { ok: true, ignored: false };
  });

  app.patch('/api/me', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const schema = z.object({
      displayName: z.string().min(1).max(80).optional(),
      avatarUrl: z.string().url().max(500).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const db = getDb();
    if (parsed.data.displayName !== undefined) {
      db.prepare(`UPDATE users SET displayName = ? WHERE id = ?`).run(
        parsed.data.displayName,
        user.id,
      );
    }
    if (parsed.data.avatarUrl !== undefined) {
      db.prepare(`UPDATE users SET avatarUrl = ? WHERE id = ?`).run(parsed.data.avatarUrl, user.id);
    }
    const row = db
      .prepare(`SELECT id, email, displayName, role, avatarUrl FROM users WHERE id = ?`)
      .get(user.id);
    return { user: row };
  });

  /** COMP-008: personalized row from watch history + favorites genres */
  app.get('/api/me/personalized', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const db = getDb();
    const limit = 12;
    const genreRows = db
      .prepare(
        `
        SELECT g.id, COUNT(*) AS c
        FROM (
          SELECT e.seriesId FROM watch_history wh
          JOIN episodes e ON e.id = wh.episodeId
          WHERE wh.userId = ?
          UNION ALL
          SELECT f.seriesId FROM favorites f WHERE f.userId = ?
        ) x
        JOIN series_genres sg ON sg.seriesId = x.seriesId
        JOIN genres g ON g.id = sg.genreId
        GROUP BY g.id
        ORDER BY c DESC
        LIMIT 5
      `,
      )
      .all(user.id, user.id) as { id: number; c: number }[];

    if (!genreRows.length) return { items: [] };

    const genreIds = genreRows.map((g) => g.id);
    const ph = genreIds.map(() => '?').join(',');
    const seen = db
      .prepare(
        `
        SELECT DISTINCT e.seriesId FROM watch_history wh
        JOIN episodes e ON e.id = wh.episodeId WHERE wh.userId = ?
        UNION
        SELECT seriesId FROM favorites WHERE userId = ?
      `,
      )
      .all(user.id, user.id) as { seriesId: number }[];
    const exclude = seen.map((s) => s.seriesId);
    const excludeSql = exclude.length
      ? `AND s.id NOT IN (${exclude.map(() => '?').join(',')})`
      : '';

    const rows = db
      .prepare(
        `
        SELECT s.*, COUNT(sg.genreId) AS overlap
        FROM series s
        JOIN series_genres sg ON sg.seriesId = s.id
        WHERE s.deletedAt IS NULL AND sg.genreId IN (${ph}) ${excludeSql}
        GROUP BY s.id
        ORDER BY overlap DESC, s.viewCount DESC
        LIMIT ?
      `,
      )
      .all(...genreIds, ...exclude, limit) as SeriesRow[];

    return {
      items: rows.map((r) => mapSeries(r, getGenresForSeries(db, r.id))),
    };
  });
}
