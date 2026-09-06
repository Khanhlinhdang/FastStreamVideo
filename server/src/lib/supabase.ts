import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let client: SupabaseClient | null | undefined;

/** True when Supabase Storage should be used for posters. */
export function isSupabaseStorageEnabled(): boolean {
  return Boolean(config.supabaseUrl && config.supabaseServiceRoleKey);
}

/**
 * Server-side Supabase client (service role).
 * Returns null when env is not configured — callers must fall back to local disk.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    client = null;
    return null;
  }
  client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return client;
}

export type PosterUploadResult = {
  /** Public URL stored in series.posterUrl */
  publicUrl: string;
  storagePath: string;
};

/**
 * Upload a poster buffer to Supabase Storage bucket.
 * Bucket should be public (or have a public read policy) so players can load images.
 */
export async function uploadPosterToSupabase(
  seriesId: number,
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<PosterUploadResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }

  const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.jpg';
  const storagePath = `series-${seriesId}-${Date.now()}${ext}`;
  const bucket = config.supabasePostersBucket;

  const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
    contentType: contentType || 'image/jpeg',
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { publicUrl: data.publicUrl, storagePath };
}
