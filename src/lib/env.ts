// Fail loudly at startup if configuration is missing, rather than at 2am with
// a confusing error from deep inside a library call.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in — see SETUP.md.`
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  supabaseAnonKey: required(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
};

// Server-only. Bypasses row-level security, so it must never be imported into
// anything that ships to the browser.
export function serviceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('Service role key must never be used in the browser.');
  }
  return required(
    'SUPABASE_SERVICE_ROLE_KEY',
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
