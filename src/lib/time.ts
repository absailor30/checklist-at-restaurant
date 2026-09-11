// Shift deadlines must be computed in the outlet's own timezone. A group with
// outlets in different zones, or a server running in UTC, would otherwise
// record work as late when it was on time.

function offsetMs(utc: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(utc);

  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second)
  );
  return asUtc - utc.getTime();
}

/** Turn a local date + wall-clock time in a timezone into a real instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const naive = Date.parse(`${date}T${time.slice(0, 5)}:00Z`);
  let ts = naive;
  // Two passes settles the offset even across a DST boundary.
  for (let i = 0; i < 2; i++) {
    ts = naive - offsetMs(new Date(ts), timeZone);
  }
  return new Date(ts);
}

/** Today's date as YYYY-MM-DD in the given timezone, not the server's. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function addMinutes(d: Date | string, minutes: number): Date {
  return new Date(new Date(d).getTime() + minutes * 60_000);
}

export function formatTime(d: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(d));
}

/** "in 25 min" / "12 min ago" — short enough for a phone. */
export function relative(to: Date | string): string {
  const diff = new Date(to).getTime() - Date.now();
  const mins = Math.round(Math.abs(diff) / 60_000);
  const text = mins < 60
    ? `${mins} min`
    : `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ''}`.trim();
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
