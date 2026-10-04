import type { LineCheckQuestion } from './questions';

export type YesNoNa = 'yes' | 'no' | 'na';

export interface LineCheckAnswer {
  questionId: string;
  yesNo?: YesNoNa;
  value?: number | null;
  photoDataUrl?: string | null;
  /** Optional second photo, taken after the corrective action. */
  correctionPhotoDataUrl?: string | null;
  correctionPhotoPath?: string | null;
  /** Storage path once the photo has actually been uploaded. */
  photoPath?: string | null;
  reason?: string | null;
  flagged?: boolean;
  /** AI photo check — informational only, null means it never ran. */
  aiVerified?: boolean | null;
  aiNote?: string | null;
}

export function inRange(q: LineCheckQuestion, value: number): boolean {
  if (q.min !== undefined && value < q.min) return false;
  if (q.max !== undefined && value > q.max) return false;
  return true;
}

/** "at or below 5°C", "between 0 and 5°C", "at least 90°C". */
export function describeRange(q: LineCheckQuestion): string {
  const u = q.unit ?? '';
  if (q.min !== undefined && q.max !== undefined) return `between ${q.min} and ${q.max}${u}`;
  if (q.max !== undefined) return `at or below ${q.max}${u}`;
  if (q.min !== undefined) return `at least ${q.min}${u}`;
  return 'the acceptable range';
}

/** A 'numeric' reading that is outside the question's acceptable range (and not N/A). */
export function isOutOfRange(q: LineCheckQuestion, a: LineCheckAnswer | undefined): boolean {
  if (q.kind !== 'numeric' || !a || a.yesNo === 'na') return false;
  if (a.value === null || a.value === undefined || Number.isNaN(a.value)) return false;
  return !inRange(q, a.value);
}

export function evidenceOk(q: LineCheckQuestion, a: LineCheckAnswer | undefined): boolean {
  if (!a) return false;
  if (q.kind === 'numeric' || q.kind === 'numeric_photo') return Boolean(a.photoDataUrl);
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

  if (q.kind === 'numeric_photo' || q.kind === 'numeric') {
    if (a.value === null || a.value === undefined || Number.isNaN(a.value)) return 0;
    return inRange(q, a.value) ? 1 : 0;
  }

  if (!q.expected || !a.yesNo || a.yesNo === 'na') return 0;
  return a.yesNo === q.expected ? 1 : 0;
}

export function canAdvance(q: LineCheckQuestion, a: LineCheckAnswer | undefined): boolean {
  if (!a) return false;
  if (q.kind === 'numeric') {
    if (a.yesNo === 'na') return true;
    return a.value !== null && a.value !== undefined && !Number.isNaN(a.value) && Boolean(a.photoDataUrl)
      && (!isOutOfRange(q, a) || Boolean(a.reason?.trim()));
  }
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
