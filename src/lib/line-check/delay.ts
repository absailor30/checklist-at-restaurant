/** 'YYYY-MM-DD HH:MM' for an instant, in a timezone. Strings of this shape compare correctly. */
export function localStamp(iso: string | Date, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

/** True when a station finished at or after the shift's deadline on its run date. */
export function finishedAfterDeadline(completedAt: string | Date, runDate: string, deadline: string | null, timeZone: string): boolean {
  return Boolean(deadline) && localStamp(completedAt, timeZone) >= `${runDate} ${deadline}`;
}
