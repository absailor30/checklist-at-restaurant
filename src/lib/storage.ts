import type { SupabaseClient } from '@supabase/supabase-js';

// Photo storage sits behind this interface so a client who insists on hosting
// their own files does not require changes anywhere else in the app.
export interface StorageService {
  upload(file: Blob, path: string): Promise<string>;
  getSignedUrl(path: string, ttlSeconds?: number): Promise<string>;
  remove(path: string): Promise<void>;
}

export const PHOTO_BUCKET = 'checklist-photos';

export function supabaseStorage(client: SupabaseClient): StorageService {
  const bucket = client.storage.from(PHOTO_BUCKET);

  return {
    async upload(file, path) {
      const { error } = await bucket.upload(path, file, {
        contentType: 'image/jpeg',
        upsert: true, // re-submitting the same item overwrites rather than orphaning
      });
      if (error) throw error;
      return path;
    },

    async getSignedUrl(path, ttlSeconds = 3600) {
      const { data, error } = await bucket.createSignedUrl(path, ttlSeconds);
      if (error) throw error;
      return data.signedUrl;
    },

    async remove(path) {
      const { error } = await bucket.remove([path]);
      if (error) throw error;
    },
  };
}

// Storage-side readability only. Retrieval always goes through the database
// record, never by parsing this back apart.
export function photoPath(opts: {
  orgId: string;
  outletId: string;
  runDate: string;
  runId: string;
  itemId: string;
}): string {
  return `${opts.orgId}/${opts.outletId}/${opts.runDate}/${opts.runId}_${opts.itemId}_${Date.now()}.jpg`;
}
