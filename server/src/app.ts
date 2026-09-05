import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config, logOptionalIntegrations } from './config.js';
import { getDb, migrate } from './db/index.js';
import { authRoutes } from './routes/auth.js';
import { catalogRoutes } from './routes/catalog.js';
import { meRoutes } from './routes/me.js';
import { adminRoutes } from './routes/admin.js';
import { commentRoutes } from './routes/comments.js';
import { playbackRoutes } from './routes/playback.js';
import { encodeQueue } from './services/encodeQueue.js';

/** Warn or refuse default secrets in production. */
export function assertProductionSecrets(): void {
  const defaultAccess = 'change-me-access-secret-dev-only';
  const defaultRefresh = 'change-me-refresh-secret-dev-only';
  const weakAccess =
    config.jwtAccessSecret === defaultAccess || config.jwtAccessSecret.length < 16;
  const weakRefresh =
    config.jwtRefreshSecret === defaultRefresh || config.jwtRefreshSecret.length < 16;
  const weakAdmin = config.seedAdminPassword === 'admin123';
  if (config.nodeEnv !== 'production') {
    if (weakAccess || weakRefresh || weakAdmin) {
      console.warn(
        '[security] Dev defaults detected for JWT and/or SEED_ADMIN_PASSWORD — change before production.',
      );
    }
    return;
  }
  if (config.jwtAccessSecret === defaultAccess || config.jwtRefreshSecret === defaultRefresh) {
    throw new Error(
      'Refusing to start: set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to strong non-default values in production.',
    );
  }
  if (weakAdmin) {
    console.warn(
      '[security] SEED_ADMIN_PASSWORD is still admin123 — change SEED_ADMIN_PASSWORD and re-seed before public deploy.',
    );
  }
}

export async function buildApp() {
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  fs.mkdirSync(config.hlsDir, { recursive: true });
  fs.mkdirSync(path.join(config.mediaRoot, 'posters'), { recursive: true });
  fs.mkdirSync(path.join(config.mediaRoot, 'subs'), { recursive: true });
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

  migrate(getDb());

  const app = Fastify({
    logger: true,
    bodyLimit: 1024 * 1024 * 512,
    // Caddy / Cloudflare forward X-Forwarded-For; use for req.ip (rate limits, telemetry)
    trustProxy: config.trustProxy,
  });

  logOptionalIntegrations(app.log);

  await app.register(helmet, {
    // SPA + HLS from same/API origin; keep CSP loose enough for Vite/dev and media
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin: config.corsOrigin,
    credentials: true,
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: config.jwtAccessSecret,
  });
  await app.register(multipart, {
    limits: { fileSize: 1024 * 1024 * 1024 * 2 }, // 2GB
  });

  // Raw binary bodies for resumable upload chunks (AUD-012)
  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );
  app.addContentTypeParser(
    'application/x-binary',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Global soft limit; auth routes add a stricter scoped limit
  await app.register(rateLimit, {
    global: false,
    max: 200,
    timeWindow: '1 minute',
  });

  await app.register(fastifyStatic, {
    root: config.mediaRoot,
    prefix: '/media/',
    decorateReply: false,
    // Disable send()'s default maxAge=0 so setHeaders fully owns Cache-Control
    cacheControl: false,
    setHeaders(res, filePath) {
      res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
      const lower = String(filePath).toLowerCase();
      const base = path.basename(lower);
      // Immutable HLS media segments / fMP4 init — long cache
      if (
        lower.endsWith('.m4s') ||
        base === 'init.mp4' ||
        /^init_\d+\.mp4$/.test(base)
      ) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return;
      }
      // Playlists — short TTL so re-encode / master updates propagate
      if (lower.endsWith('.m3u8')) {
        res.setHeader('Cache-Control', 'public, max-age=60');
        return;
      }
      // Subtitles
      if (lower.endsWith('.vtt') || lower.endsWith('.srt')) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        return;
      }
      // Posters and other media assets
      if (
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.svg')
      ) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return;
      }
      res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  });

  if (config.signedMedia) {
    const { verifyMediaSignature } = await import('./lib/mediaSign.js');
    app.addHook('onRequest', async (req, reply) => {
      const url = req.url.split('?')[0] ?? '';
      if (!url.startsWith('/media/hls/')) return;
      const cookies = req.cookies as Record<string, string | undefined>;
      if (cookies.livestream_media === '1') return;
      const q = req.query as { exp?: string; sig?: string };
      const ok = verifyMediaSignature(url, String(q.exp ?? ''), String(q.sig ?? ''));
      if (!ok) {
        return reply.code(403).send({ error: 'Signed media URL required or expired' });
      }
      // Cookie covers relative segment requests for the TTL window
      reply.setCookie('livestream_media', '1', {
        path: '/media/hls',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: 60 * 60,
      });
    });
  }

  app.get('/api/health', async () => {
    const { isR2Configured } = await import('./lib/r2.js');
    return {
      ok: true,
      service: 'LiveStream API',
      time: new Date().toISOString(),
      encoder: process.env.ENCODE_IN_PROCESS === '0' ? 'remote' : 'inline',
      r2: isR2Configured(),
      r2PublishMode: config.r2PublishMode,
      maxEncodeHeight: config.maxEncodeHeight,
    };
  });

  await app.register(catalogRoutes);
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(adminRoutes);
  await app.register(commentRoutes);
  await app.register(playbackRoutes);

  // Continue-watching on home when authenticated (optional enrichment)
  app.addHook('onReady', async () => {
    if (process.env.ENCODE_IN_PROCESS !== '0') {
      encodeQueue.resumePending();
    }
  });

  return app;
}
