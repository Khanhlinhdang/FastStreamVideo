import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Prefer REPO_ROOT env (Docker). Compiled dist/src → ../../.. ; tsx src → ../.. */
function resolveRepoRoot(): string {
  if (process.env.REPO_ROOT) return path.resolve(process.env.REPO_ROOT);
  const normalized = __dirname.replace(/\\/g, '/');
  const fromCompiled = normalized.includes('/dist/');
  return path.resolve(__dirname, fromCompiled ? '../../..' : '../..');
}

export const REPO_ROOT = resolveRepoRoot();

dotenv.config({ path: path.join(REPO_ROOT, '.env') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.production') });
dotenv.config({ path: path.join(REPO_ROOT, '.env.example') });

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${key}`);
  return v;
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

function resolveBinary(envKey: string, fallbackName: string, installerPath: string): string {
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;
  const probe = spawnSync(fallbackName, ['-version'], { encoding: 'utf8', windowsHide: true });
  if (probe.status === 0) return fallbackName;
  return installerPath;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const cookieSecureEnv = process.env.COOKIE_SECURE;
/** Default secure cookies in production unless explicitly disabled. */
const cookieSecure =
  cookieSecureEnv !== undefined
    ? cookieSecureEnv === 'true'
    : nodeEnv === 'production';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv,
  databasePath: resolvePath(env('DATABASE_PATH', './data/livestream.db')),
  mediaRoot: resolvePath(env('MEDIA_ROOT', './media')),
  uploadsDir: resolvePath(env('UPLOADS_DIR', './media/uploads')),
  hlsDir: resolvePath(env('HLS_DIR', './media/hls')),
  jwtAccessSecret: env('JWT_ACCESS_SECRET', 'change-me-access-secret-dev-only'),
  jwtRefreshSecret: env('JWT_REFRESH_SECRET', 'change-me-refresh-secret-dev-only'),
  jwtAccessTtl: env('JWT_ACCESS_TTL', '15m'),
  jwtRefreshTtl: env('JWT_REFRESH_TTL', '7d'),
  cookieSecure,
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? 'lax') as 'lax' | 'strict' | 'none',
  corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
  /** Honor X-Forwarded-* / proxy chain (Caddy, Cloudflare). */
  trustProxy: (process.env.TRUST_PROXY ?? (nodeEnv === 'production' ? 'true' : 'false')) === 'true',
  seedAdminEmail: env('SEED_ADMIN_EMAIL', 'admin@livestream.local'),
  seedAdminPassword: env('SEED_ADMIN_PASSWORD', 'admin123'),
  seedAdminName: env('SEED_ADMIN_NAME', 'Admin'),
  seedEditorEmail: env('SEED_EDITOR_EMAIL', 'editor@livestream.local'),
  seedEditorPassword: env('SEED_EDITOR_PASSWORD', 'editor123'),
  seedEditorName: env('SEED_EDITOR_NAME', 'Editor'),
  ffmpegPath: resolveBinary('FFMPEG_PATH', 'ffmpeg', ffmpegInstaller.path),
  ffprobePath: resolveBinary('FFPROBE_PATH', 'ffprobe', ffprobeInstaller.path),
  /** Optional extra AV1/VP9 rung beside H.264 (slow encode). Default off. */
  enableAv1Ladder: (process.env.ENABLE_AV1_LADDER ?? '0') === '1',
  /** Optional signed media (AUD-025): SIGNED_MEDIA=1 + MEDIA_SIGNING_SECRET */
  signedMedia: (process.env.SIGNED_MEDIA ?? '0') === '1',
  mediaSigningSecret: process.env.MEDIA_SIGNING_SECRET?.trim() || '',
  encodeWebhookUrl: process.env.ENCODE_WEBHOOK_URL?.trim() || '',

  // ——— Optional third-party (env-driven; unset = disabled) ———
  /** Phase B Postgres URL — unused while SQLite is default. */
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY?.trim() || '',
  supabasePostersBucket: process.env.SUPABASE_POSTERS_BUCKET?.trim() || 'posters',
  sentryDsn: process.env.SENTRY_DSN?.trim() || '',
  resendApiKey: process.env.RESEND_API_KEY?.trim() || '',
  smtpHost: process.env.SMTP_HOST?.trim() || '',
  emailFrom: process.env.EMAIL_FROM?.trim() || '',

  /** Cap ABR ladder height (720 = no 1080 rung). Default 1080. */
  maxEncodeHeight: Math.max(
    480,
    Number.parseInt(process.env.MAX_ENCODE_HEIGHT ?? '1080', 10) || 1080,
  ),

  // Cloudflare R2 (S3-compatible HLS publish) — unset = local only
  r2AccountId: process.env.R2_ACCOUNT_ID?.trim() || '',
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() || '',
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() || '',
  r2Bucket: process.env.R2_BUCKET?.trim() || '',
  r2PublicBaseUrl:
    process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ||
    process.env.MEDIA_ORIGIN?.trim().replace(/\/+$/, '') ||
    '',
  /** off | hot | all — hot = series.isHot only. Default off until R2 keys set in prod. */
  r2PublishMode: (process.env.R2_PUBLISH_MODE?.trim().toLowerCase() || 'off') as
    | 'off'
    | 'hot'
    | 'all',
};

/** Re-read mutable flags from process.env (tests / late env injection). */
export function refreshRuntimeFlagsFromEnv(): void {
  (config as { maxEncodeHeight: number }).maxEncodeHeight = Math.max(
    480,
    Number.parseInt(process.env.MAX_ENCODE_HEIGHT ?? '1080', 10) || 1080,
  );
  (config as { r2PublicBaseUrl: string }).r2PublicBaseUrl =
    process.env.R2_PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') ||
    process.env.MEDIA_ORIGIN?.trim().replace(/\/+$/, '') ||
    '';
  (config as { r2PublishMode: 'off' | 'hot' | 'all' }).r2PublishMode = (
    process.env.R2_PUBLISH_MODE?.trim().toLowerCase() || 'off'
  ) as 'off' | 'hot' | 'all';
}

/** Log optional integrations once at boot (no secrets). */
export function logOptionalIntegrations(log: { info: (o: object, msg?: string) => void }): void {
  const r2Configured = Boolean(
    (process.env.R2_MOCK_DIR?.trim() && config.r2PublicBaseUrl) ||
      (config.r2AccountId &&
        config.r2AccessKeyId &&
        config.r2SecretAccessKey &&
        config.r2Bucket &&
        config.r2PublicBaseUrl),
  );
  log.info(
    {
      sqlite: config.databasePath,
      databaseUrlConfigured: Boolean(config.databaseUrl),
      supabaseStorage: Boolean(config.supabaseUrl && config.supabaseServiceRoleKey),
      r2: r2Configured,
      r2PublishMode: config.r2PublishMode,
      maxEncodeHeight: config.maxEncodeHeight,
      signedMedia: config.signedMedia,
      enableAv1Ladder: config.enableAv1Ladder,
      encoder: process.env.ENCODE_IN_PROCESS === '0' ? 'remote' : 'inline',
      sentry: Boolean(config.sentryDsn),
      email: Boolean(config.resendApiKey || config.smtpHost),
      trustProxy: config.trustProxy,
      cookieSecure: config.cookieSecure,
      corsOrigin: config.corsOrigin,
    },
    'integrations',
  );
  if (config.signedMedia) {
    log.info(
      {
        warn: 'SIGNED_MEDIA=1 breaks shared CDN cache keys for HLS — keep 0 with Cloudflare cache',
      },
      'cdn-cache',
    );
  }
  if (config.databaseUrl) {
    log.info(
      { note: 'DATABASE_URL is set but SQLite remains active until Phase B migration' },
      'supabase-postgres',
    );
  }
}
