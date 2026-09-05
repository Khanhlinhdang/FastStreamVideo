import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  clearRefreshCookie,
  createRefreshToken,
  findUserByRefreshToken,
  getUserByEmail,
  getUserById,
  hashPassword,
  parseTtlToMs,
  requireAuth,
  revokeRefreshToken,
  setRefreshCookie,
  storeRefreshToken,
  verifyPassword,
  type AccessPayload,
} from '../auth/index.js';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  displayName: z.string().min(1).max(80),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(u: {
  id: number;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string | null;
}) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    avatarUrl: u.avatarUrl ?? null,
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  async function issueTokens(
    reply: Parameters<typeof setRefreshCookie>[0],
    user: { id: number; email: string; role: 'user' | 'admin' | 'editor'; displayName: string; avatarUrl: string | null },
  ) {
    const payload: AccessPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = await reply.jwtSign(payload, {
      sign: { expiresIn: config.jwtAccessTtl },
    });

    const refresh = createRefreshToken();
    const expiresAt = new Date(Date.now() + parseTtlToMs(config.jwtRefreshTtl));
    storeRefreshToken(user.id, refresh, expiresAt);
    setRefreshCookie(reply, refresh);

    return { accessToken, user: publicUser(user) };
  }

  app.post('/api/auth/register', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
      },
    },
  }, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.flatten() });
    }
    const { email, password, displayName } = parsed.data;
    if (getUserByEmail(email)) {
      return reply.code(409).send({ error: 'Email already registered' });
    }
    const r = getDb()
      .prepare(
        `INSERT INTO users (email, passwordHash, displayName, role) VALUES (?, ?, ?, 'user')`,
      )
      .run(email, hashPassword(password), displayName);
    const user = getUserById(Number(r.lastInsertRowid))!;
    return issueTokens(reply, user);
  });

  app.post('/api/auth/login', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes',
      },
    },
  }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body' });
    }
    const row = getUserByEmail(parsed.data.email);
    if (!row || !verifyPassword(parsed.data.password, row.passwordHash)) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }
    const { passwordHash: _, ...user } = row;
    return issueTokens(reply, user);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies.refreshToken;
    if (token) revokeRefreshToken(token);
    clearRefreshCookie(reply);
    return { ok: true };
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    const token = req.cookies.refreshToken;
    if (!token) return reply.code(401).send({ error: 'No refresh token' });

    const user = findUserByRefreshToken(token);
    if (!user) {
      clearRefreshCookie(reply);
      return reply.code(401).send({ error: 'Invalid refresh token' });
    }

    revokeRefreshToken(token);
    return issueTokens(reply, user);
  });

  app.get('/api/me', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    return { user: publicUser(user) };
  });

  // COMP-016: password reset (dev logs token when SMTP unset)
  app.post('/api/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid email' });
    const row = getUserByEmail(parsed.data.email);
    // Always OK to avoid email enumeration
    if (!row) return { ok: true };
    const { createHash, randomBytes } = await import('node:crypto');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    getDb()
      .prepare(
        `INSERT INTO password_reset_tokens (userId, tokenHash, expiresAt) VALUES (?, ?, ?)`,
      )
      .run(row.id, tokenHash, expiresAt);
    if (config.nodeEnv !== 'production') {
      req.log.info({ resetToken: token, email: row.email }, '[auth] password reset token (dev)');
    }
    return {
      ok: true,
      ...(config.nodeEnv !== 'production' ? { devToken: token } : {}),
    };
  });

  app.post('/api/auth/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = z
      .object({
        token: z.string().min(10),
        password: z.string().min(6).max(128),
      })
      .safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid body' });
    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
    const db = getDb();
    const row = db
      .prepare(
        `SELECT * FROM password_reset_tokens WHERE tokenHash = ? AND usedAt IS NULL`,
      )
      .get(tokenHash) as
      | { id: number; userId: number; expiresAt: string }
      | undefined;
    if (!row || new Date(row.expiresAt).getTime() < Date.now()) {
      return reply.code(400).send({ error: 'Token expired or invalid' });
    }
    db.prepare(`UPDATE users SET passwordHash = ? WHERE id = ?`).run(
      hashPassword(parsed.data.password),
      row.userId,
    );
    db.prepare(`UPDATE password_reset_tokens SET usedAt = datetime('now') WHERE id = ?`).run(
      row.id,
    );
    return { ok: true };
  });
}
