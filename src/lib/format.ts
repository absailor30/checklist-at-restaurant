// How dates and numbers read on screen and in exports.
//  - dates: DD-Mmm-YY, for example 22-Oct-26
//  - numbers: grouped with commas in the western system, for example 1,234 and 100,000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const NUMBER_LOCALE = 'en-US';

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' (read as written, no timezone shift) or a Date / timestamp (read in the device's timezone) -> '22-Oct-26'. */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return `${d.slice(8, 10)}-${MONTHS[Number(d.slice(5, 7)) - 1]}-${d.slice(2, 4)}`;
  }
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return `${pad(dt.getDate())}-${MONTHS[dt.getMonth()]}-${pad(dt.getFullYear() % 100)}`;
}

/** Short form for chart axes: '22-Oct'. */
export function fmtDayMonth(d: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}-${MONTHS[Number(d.slice(5, 7)) - 1]}` : d;
}

/** 1234567 -> '1,234,567'. Percentages and small counts come out unchanged. */
export function fmtNum(n: number | null | undefined, maxDecimals = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: maxDecimals });
}
