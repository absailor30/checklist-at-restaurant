import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

// Browser client for managers and owners. Carries their session, so every
// query is filtered by the row-level security policies.
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
