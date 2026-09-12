import crypto from 'crypto';

// The scheduled job needs a secret that only the scheduler and this app know.
//
// Requiring a separate CRON_SECRET meant the job silently did nothing until
// someone remembered to set it, and the failure was invisible unless you
// happened to read /health. Instead it is derived from APP_SESSION_SECRET,
// which is already required for the app to run at all — so the job works out
// of the box, with a secret that is just as unguessable.
//
// The derivation is one-way, so publishing the cron token to the person
// configuring a scheduler does not expose APP_SESSION_SECRET. An explicit
// CRON_SECRET still wins, for anyone who prefers to manage it themselves or
// needs to rotate the two independently.
export function cronToken(): string {
  const explicit = process.env.CRON_SECRET;
  if (explicit) return explicit;

  const base = process.env.APP_SESSION_SECRET;
  if (!base || base.length < 32) {
    throw new Error(
      'Neither CRON_SECRET nor a usable APP_SESSION_SECRET is configured.'
    );
  }
  return crypto.createHmac('sha256', base).update('cron-refresh-v1').digest('hex');
}

export function cronTokenIsExplicit(): boolean {
  return Boolean(process.env.CRON_SECRET);
}

/** Constant-time comparison, so the token cannot be guessed byte by byte. */
export function cronTokenMatches(provided: string): boolean {
  const expected = cronToken();
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
