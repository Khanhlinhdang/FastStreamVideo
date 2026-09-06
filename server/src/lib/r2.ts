/**
 * Cloudflare R2 (S3-compatible) client — optional.
 * Unset R2_* → disabled; local HLS path unchanged.
 * R2_MOCK_DIR → write objects to a local directory (dev/CI without real R2).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { config, REPO_ROOT } from '../config.js';

let client: S3Client | null | undefined;

function mockDir(): string | null {
  const raw = process.env.R2_MOCK_DIR?.trim();
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
}

export function isR2Configured(): boolean {
  if (mockDir() && config.r2PublicBaseUrl) return true;
  return Boolean(
    config.r2AccountId &&
      config.r2AccessKeyId &&
      config.r2SecretAccessKey &&
      config.r2Bucket &&
      config.r2PublicBaseUrl,
  );
}

export function getR2Client(): S3Client | null {
  if (mockDir()) return null;
  if (client !== undefined) return client;
  if (
    !config.r2AccountId ||
    !config.r2AccessKeyId ||
    !config.r2SecretAccessKey ||
    !config.r2Bucket
  ) {
    client = null;
    return null;
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2AccessKeyId,
      secretAccessKey: config.r2SecretAccessKey,
    },
  });
  return client;
}

/** Reset cached client (tests). */
export function resetR2ClientForTests(): void {
  client = undefined;
}

export async function r2PutObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
  cacheControl?: string,
): Promise<void> {
  const mock = mockDir();
  const cleanKey = key.replace(/^\/+/, '');
  if (mock) {
    const dest = path.join(mock, cleanKey);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, typeof body === 'string' ? body : Buffer.from(body));
    fs.writeFileSync(
      `${dest}.meta.json`,
      JSON.stringify({ contentType, cacheControl: cacheControl ?? null }),
    );
    return;
  }
  const s3 = getR2Client();
  if (!s3) throw new Error('R2 is not configured');
  const input: PutObjectCommandInput = {
    Bucket: config.r2Bucket,
    Key: cleanKey,
    Body: typeof body === 'string' ? Buffer.from(body) : body,
    ContentType: contentType,
  };
  if (cacheControl) input.CacheControl = cacheControl;
  await s3.send(new PutObjectCommand(input));
}

export async function r2SmokeCheck(): Promise<{ ok: boolean; error?: string }> {
  const mock = mockDir();
  if (mock) {
    fs.mkdirSync(mock, { recursive: true });
    return { ok: true };
  }
  const s3 = getR2Client();
  if (!s3) return { ok: false, error: 'R2 not configured' };
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.r2Bucket }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function r2ListPrefix(prefix: string, maxKeys = 20): Promise<string[]> {
  const mock = mockDir();
  const clean = prefix.replace(/^\/+/, '');
  if (mock) {
    const root = path.join(mock, clean);
    if (!fs.existsSync(root)) return [];
    const out: string[] = [];
    const walk = (p: string, rel: string) => {
      for (const name of fs.readdirSync(p)) {
        if (name.endsWith('.meta.json')) continue;
        const full = path.join(p, name);
        const r = rel ? `${rel}/${name}` : name;
        if (fs.statSync(full).isDirectory()) walk(full, r);
        else {
          out.push(`${clean}/${r}`.replace(/\/+/g, '/'));
          if (out.length >= maxKeys) return;
        }
      }
    };
    if (fs.statSync(root).isDirectory()) walk(root, '');
    else out.push(clean);
    return out.slice(0, maxKeys);
  }
  const s3 = getR2Client();
  if (!s3) return [];
  const listed = await s3.send(
    new ListObjectsV2Command({
      Bucket: config.r2Bucket,
      Prefix: clean,
      MaxKeys: maxKeys,
    }),
  );
  return (listed.Contents ?? []).map((o) => o.Key ?? '').filter(Boolean);
}

export function r2PublicUrl(objectKey: string): string {
  const base = config.r2PublicBaseUrl.replace(/\/+$/, '');
  const key = objectKey.replace(/^\/+/, '');
  return `${base}/${key}`;
}
