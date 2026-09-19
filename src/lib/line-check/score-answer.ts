import type { LineCheckQuestion } from './questions';

export type YesNoNa = 'yes' | 'no' | 'na';

export interface LineCheckAnswer {
  questionId: string;
  yesNo?: YesNoNa;
  value?: number | null;
  photoDataUrl?: string | null;
  reason?: string | null;
  flagged?: boolean;
}

export function inRange(q: LineCheckQuestion, value: number): boolean {
  if (q.min !== undefined && value < q.min) return false;
  if (q.max !== undefined && value > q.max) return false;
  return true;
}

export function evidenceOk(q: LineCheckQuestion, a: LineCheckAnswer | undefined): boolean {
  if (!a) return false;
  if (q.kind === 'numeric_photo') return Boolean(a.photoDataUrl);
  if (q.kind === 'yes_no_photo_always') return Boolean(a.photoDataUrl);
  if (q.kind === 'yes_no_photo_on_no') {
    if (a.yesNo === 'no') return Boolean(a.photoDataUrl);
    return true;
  }
  if (q.kind === 'yes_photo_no_reason') {
    if (a.yesNo === 'yes') return Boolean(a.photoDataUrl);
    if (a.yesNo === 'no') return Boolean(a.reason?.trim());
    return false;
  }
  if (q.kind === 'yes_no_reason_on_no') {
    if (a.yesNo === 'no') return Boolean(a.reason?.trim());
    return a.yesNo === 'yes';
  }
  return true;
}

/** 1 pass, 0 fail, null N/A (excluded). Missing answer = 0. */
export function scoreAnswer(
  q: LineCheckQuestion,
  a: LineCheckAnswer | undefined
): 1 | 0 | null {
  if (!a) return 0;
  // N/A is a uniform option on every yes/no-style question, not just the
  // ones originally typed yes_no_na — it always excludes rather than fails.
  if (q.kind !== 'numeric_photo' && a.yesNo === 'na') return null;
  if (!evidenceOk(q, a)) return 0;

  if (q.kind === 'numeric_photo') {
    if (a.value === null || a.value === undefined || Number.isNaN(a.value)) return 0;
    return inRange(q, a.value) ? 1 : 0;
  }

  if (!q.expected || !a.yesNo || a.yesNo === 'na') return 0;
  return a.yesNo === q.expected ? 1 : 0;
}

export function canAdvance(q: LineCheckQuestion, a: LineCheckAnswer | undefined): boolean {
  if (!a) return false;
  if (q.kind === 'numeric_photo') {
    return a.value !== null && a.value !== undefined && !Number.isNaN(a.value) && Boolean(a.photoDataUrl);
  }
  // N/A always needs nothing further — there's nothing to prove.
  if (a.yesNo === 'na') return true;
  if (q.kind === 'yes_no_na') return a.yesNo === 'yes' || a.yesNo === 'no' || a.yesNo === 'na';
  if (q.kind === 'yes_photo_no_reason') {
    if (a.yesNo === 'yes') return Boolean(a.photoDataUrl);
    if (a.yesNo === 'no') return Boolean(a.reason?.trim());
    return false;
  }
  if (q.kind === 'yes_no_photo_always') {
    return (a.yesNo === 'yes' || a.yesNo === 'no') && Boolean(a.photoDataUrl);
  }
  if (q.kind === 'yes_no_photo_on_no') {
    if (a.yesNo === 'yes') return true;
    if (a.yesNo === 'no') return Boolean(a.photoDataUrl);
    return false;
  }
  if (q.kind === 'yes_no_reason_on_no') {
    if (a.yesNo === 'yes') return true;
    if (a.yesNo === 'no') return Boolean(a.reason?.trim());
    return false;
  }
  return a.yesNo === 'yes' || a.yesNo === 'no';
}
