import type { SupabaseClient } from '@supabase/supabase-js';
import { PHOTO_BUCKET } from '@/lib/storage';

/**
 * Deletes photo files older than PHOTO_RETENTION_DAYS (default 60). Photos are
 * stored as <org>/<outlet>/<YYYY-MM-DD>/file.jpg, so the date folder decides.
 * Readings, answers and comments stay; only the image files are removed.
 * Never throws.
 */
export async function purgeOldPhotos(db: SupabaseClient): Promise<number> {
  let removed = 0;
  try {
    const days = Number(process.env.PHOTO_RETENTION_DAYS ?? 60);
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const bucket = db.storage.from(PHOTO_BUCKET);
    const { data: orgs } = await bucket.list('', { limit: 1000 });
    for (const org of orgs ?? []) {
      const { data: outlets } = await bucket.list(org.name, { limit: 1000 });
      for (const outlet of outlets ?? []) {
        const { data: dates } = await bucket.list(`${org.name}/${outlet.name}`, { limit: 1000 });
        for (const d of dates ?? []) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name) || d.name >= cutoff) continue;
          const dir = `${org.name}/${outlet.name}/${d.name}`;
          const { data: files } = await bucket.list(dir, { limit: 1000 });
          const paths = (files ?? []).map((f) => `${dir}/${f.name}`);
          if (paths.length) { await bucket.remove(paths); removed += paths.length; }
        }
      }
    }
  } catch (e) {
    console.error('purgeOldPhotos failed:', e);
  }
  return removed;
}
