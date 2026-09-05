import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../auth/index.js';
import { getDb } from '../db/index.js';

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { episodeId: string };
    Querystring: { page?: string; limit?: string };
  }>('/api/episodes/:episodeId/comments', async (req, reply) => {
    const episodeId = Number(req.params.episodeId);
    const db = getDb();
    const ep = db
      .prepare(`SELECT id FROM episodes WHERE id = ? AND deletedAt IS NULL`)
      .get(episodeId);
    if (!ep) return reply.code(404).send({ error: 'Episode not found' });

    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const offset = (page - 1) * limit;

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM comments WHERE episodeId = ? AND deletedAt IS NULL AND hiddenAt IS NULL`,
        )
        .get(episodeId) as { c: number }
    ).c;

    const items = db
      .prepare(
        `
        SELECT c.id, c.body, c.createdAt, c.updatedAt, c.flagCount,
               u.id AS userId, u.displayName, u.avatarUrl
        FROM comments c
        JOIN users u ON u.id = c.userId
        WHERE c.episodeId = ? AND c.deletedAt IS NULL AND c.hiddenAt IS NULL
        ORDER BY c.createdAt DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(episodeId, limit, offset);

    return { page, limit, total, items };
  });

  app.post<{ Params: { episodeId: string } }>(
    '/api/episodes/:episodeId/comments',
    {
      config: {
        rateLimit: { max: 30, timeWindow: '10 minutes' },
      },
    },
    async (req, reply) => {
      const user = await requireAuth(req, reply);
      if (!user) return;
      const episodeId = Number(req.params.episodeId);
      const schema = z.object({ body: z.string().min(1).max(2000) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });

      const db = getDb();
      const ep = db
        .prepare(`SELECT id FROM episodes WHERE id = ? AND deletedAt IS NULL`)
        .get(episodeId);
      if (!ep) return reply.code(404).send({ error: 'Episode not found' });

      const r = db
        .prepare(`INSERT INTO comments (userId, episodeId, body) VALUES (?, ?, ?)`)
        .run(user.id, episodeId, parsed.data.body.trim());

      return {
        id: Number(r.lastInsertRowid),
        body: parsed.data.body.trim(),
        episodeId,
        user: {
          id: user.id,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        createdAt: new Date().toISOString(),
      };
    },
  );

  app.put<{ Params: { id: string } }>('/api/comments/:id', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const id = Number(req.params.id);
    const schema = z.object({ body: z.string().min(1).max(2000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });

    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM comments WHERE id = ? AND deletedAt IS NULL`)
      .get(id) as { id: number; userId: number } | undefined;
    if (!row) return reply.code(404).send({ error: 'Not found' });
    if (row.userId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    db.prepare(
      `UPDATE comments SET body = ?, updatedAt = datetime('now') WHERE id = ?`,
    ).run(parsed.data.body.trim(), id);

    return db
      .prepare(
        `SELECT c.id, c.body, c.createdAt, c.updatedAt, c.episodeId,
                u.id AS userId, u.displayName, u.avatarUrl
         FROM comments c JOIN users u ON u.id = c.userId WHERE c.id = ?`,
      )
      .get(id);
  });

  app.delete<{ Params: { id: string } }>('/api/comments/:id', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const id = Number(req.params.id);
    const db = getDb();
    const row = db
      .prepare(`SELECT * FROM comments WHERE id = ? AND deletedAt IS NULL`)
      .get(id) as { id: number; userId: number } | undefined;
    if (!row) return reply.code(404).send({ error: 'Not found' });
    if (row.userId !== user.id && user.role !== 'admin') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    db.prepare(`UPDATE comments SET deletedAt = datetime('now') WHERE id = ?`).run(id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/api/comments/:id/report', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const id = Number(req.params.id);
    const db = getDb();
    const row = db
      .prepare(`SELECT id FROM comments WHERE id = ? AND deletedAt IS NULL AND hiddenAt IS NULL`)
      .get(id);
    if (!row) return reply.code(404).send({ error: 'Not found' });
    try {
      db.prepare(`INSERT INTO comment_reports (commentId, userId) VALUES (?, ?)`).run(id, user.id);
      db.prepare(`UPDATE comments SET flagCount = flagCount + 1 WHERE id = ?`).run(id);
    } catch {
      return { ok: true, alreadyReported: true };
    }
    const flags = (
      db.prepare(`SELECT flagCount FROM comments WHERE id = ?`).get(id) as { flagCount: number }
    ).flagCount;
    return { ok: true, flagCount: flags };
  });
}
