import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

export function signMediaPath(mediaPath: string, ttlSec = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${mediaPath}:${exp}`;
  const sig = createHmac('sha256', config.mediaSigningSecret || 'dev')
    .update(payload)
    .digest('hex');
  return `exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(mediaPath: string, expRaw: string, sig: string): boolean {
  if (!config.signedMedia) return true;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const payload = `${mediaPath}:${exp}`;
  const expected = createHmac('sha256', config.mediaSigningSecret || 'dev')
    .update(payload)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
