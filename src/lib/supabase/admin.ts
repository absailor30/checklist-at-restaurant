import { createClient } from '@supabase/supabase-js';
import { env, serviceRoleKey } from '@/lib/env';

// Server-side client that bypasses row-level security.
//
// Used for the floor-staff paths: staff sign in with a name and a PIN and have
// no Supabase Auth session, so RLS has no identity to filter on. Every route
// using this MUST scope its own queries by org_id and outlet_id explicitly.
// Treat this as "the safety net is off" and write the query accordingly.
export function createAdminClient() {
  return createClient(env.supabaseUrl, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
