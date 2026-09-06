import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { getDb } from '../db/index.js';

export type UserRole = 'user' | 'admin' | 'editor';

export type AuthUser = {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
};

export type AccessPayload = {
  sub: number;
  email: string;
  role: UserRole;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessPayload;
    user: AccessPayload;
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function storeRefreshToken(userId: number, token: string, expiresAt: Date): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO refresh_tokens (userId, tokenHash, expiresAt) VALUES (?, ?, ?)`,
  ).run(userId, hashToken(token), expiresAt.toISOString());
}

export function revokeRefreshToken(token: string): void {
  getDb().prepare(`DELETE FROM refresh_tokens WHERE tokenHash = ?`).run(hashToken(token));
}

export function revokeAllUserRefreshTokens(userId: number): void {
  getDb().prepare(`DELETE FROM refresh_tokens WHERE userId = ?`).run(userId);
}

export function findUserByRefreshToken(token: string): AuthUser | null {
  const row = getDb()
    .prepare(
      `
      SELECT u.id, u.email, u.displayName, u.role, u.avatarUrl, rt.expiresAt
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.userId
      WHERE rt.tokenHash = ?
    `,
    )
    .get(hashToken(token)) as
    | (AuthUser & { expiresAt: string })
    | undefined;

  if (!row) return null;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    revokeRefreshToken(token);
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    avatarUrl: row.avatarUrl,
  };
}

export function getUserById(id: number): AuthUser | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, displayName, role, avatarUrl FROM users WHERE id = ?`,
    )
    .get(id) as AuthUser | undefined;
  return row ?? null;
}

export function getUserByEmail(email: string): (AuthUser & { passwordHash: string }) | null {
  const row = getDb()
    .prepare(
      `SELECT id, email, displayName, role, avatarUrl, passwordHash FROM users WHERE email = ? COLLATE NOCASE`,
    )
    .get(email) as (AuthUser & { passwordHash: string }) | undefined;
  return row ?? null;
}

export function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie('refreshToken', token, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie('refreshToken', { path: '/' });
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  try {
    await request.jwtVerify();
    const user = getUserById(request.user.sub);
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return null;
    }
    return user;
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
    return null;
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (user.role !== 'admin') {
    reply.code(403).send({ error: 'Forbidden' });
    return null;
  }
  return user;
}

/** Admin or editor — catalog/upload; not user-role or secret management. */
export async function requireEditor(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'editor') {
    reply.code(403).send({ error: 'Forbidden' });
    return null;
  }
  return user;
}

export function parseTtlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/i.exec(ttl.trim());
  if (!m) return 15 * 60 * 1000;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}
