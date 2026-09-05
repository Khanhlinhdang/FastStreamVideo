import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';

const bodySchema = z.object({
  episodeId: z.coerce.number().int().positive(),
  type: z.enum(['rebuffer', 'error']),
  durationMs: z.coerce.number().min(0).max(600_000).optional(),
  level: z.coerce.number().int().optional(),
});

/** Simple in-memory rate limit: max N events per IP per window. */
const hits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function allowIp(ip: string): boolean {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now > cur.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (cur.count >= RATE_LIMIT) return false;
  cur.count += 1;
  return true;
}

export async function playbackRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/playback/events', async (req, reply) => {
    const ip = req.ip || 'unknown';
    if (!allowIp(ip)) {
      return reply.code(429).send({ error: 'Too many playback events' });
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }

    const { episodeId, type, durationMs, level } = parsed.data;
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO playback_events (episodeId, type, durationMs, level) VALUES (?, ?, ?, ?)`,
      )
      .run(episodeId, type, durationMs ?? null, level ?? null);

    req.log.info(
      { episodeId, type, durationMs, level, id: info.lastInsertRowid },
      'playback_event',
    );

    return { ok: true, id: Number(info.lastInsertRowid) };
  });
}
