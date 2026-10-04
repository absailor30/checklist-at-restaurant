/** "16:15" -> "4:15 PM". Returns null for anything that isn't HH:MM. */
export function formatCheckTime(hhmm: string | null | undefined): string | null {
  const m = /^([0-2][0-9]):([0-5][0-9])$/.exec(hhmm ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
