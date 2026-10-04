import type { SupabaseClient } from '@supabase/supabase-js';
import { L1_HARD_STOP, L1_QUESTIONS, type LineCheckQuestion, type QuestionKind } from './questions';

export interface BankStation {
  no: number;
  name: string;
  questions: LineCheckQuestion[];
}

export interface Bank {
  stations: BankStation[];
  /** 'HH:MM' local cutoff, or null when the brand has no hard stop. */
  hardStop: string | null;
  /** True when the brand defined its own L1 questions rather than using the global default. */
  own: boolean;
}

interface OrgConfig {
  stationNames?: string[];
  hardStop?: string;
}

export function hardStopOf(config: OrgConfig | null | undefined): string | null {
  const v = config?.hardStop;
  if (v === undefined || v === null || v === '') return L1_HARD_STOP;
  return v === 'none' ? null : v;
}

function toQuestion(r: any): LineCheckQuestion {
  return {
    id: r.id,
    order: r.sort_order,
    kind: r.kind as QuestionKind,
    prompt: r.prompt,
    expected: r.expected === 'yes' || r.expected === 'no' ? r.expected : undefined,
    unit: r.unit ?? undefined,
    min: r.min_value === null || r.min_value === undefined ? undefined : Number(r.min_value),
    max: r.max_value === null || r.max_value === undefined ? undefined : Number(r.max_value),
    photoRequired: Boolean(r.photo_required),
    reasonOnNo: Boolean(r.reason_on_no),
    notes: r.notes ?? undefined,
  };
}

/**
 * The L1 checklist for a brand. A brand with its own L1 questions gets its own
 * named stations; every other brand gets the global default bank repeated on
 * `stationCount` stations, exactly as before.
 */
export async function loadBank(db: SupabaseClient, orgId: string, stationCount: number): Promise<Bank> {
  const [{ data: org }, { data: rows }] = await Promise.all([
    db.from('organisations').select('line_check_config').eq('id', orgId).maybeSingle(),
    db.from('line_check_questions')
      .select('id, sort_order, kind, prompt, expected, unit, min_value, max_value, photo_required, reason_on_no, notes, station_no')
      .eq('level', 'L1')
      .eq('org_id', orgId)
      .not('station_no', 'is', null)
      .order('station_no')
      .order('sort_order'),
  ]);

  const config = (org?.line_check_config ?? {}) as OrgConfig;
  const hardStop = hardStopOf(config);
  const names = config.stationNames ?? [];

  if (rows && rows.length > 0) {
    const byStation = new Map<number, LineCheckQuestion[]>();
    for (const r of rows) {
      const list = byStation.get(r.station_no) ?? [];
      list.push(toQuestion(r));
      byStation.set(r.station_no, list);
    }
    const stations = [...byStation.entries()]
      .sort(([a], [b]) => a - b)
      .map(([no, questions]) => ({ no, name: names[no - 1] || `Station ${no}`, questions }));
    return { stations, hardStop, own: true };
  }

  const count = Math.max(1, stationCount);
  const stations = Array.from({ length: count }, (_, i) => ({
    no: i + 1,
    name: names[i] || `Station ${i + 1}`,
    questions: L1_QUESTIONS,
  }));
  return { stations, hardStop, own: false };
}

export function findQuestion(bank: Bank, questionId: string): LineCheckQuestion | undefined {
  for (const s of bank.stations) {
    const q = s.questions.find((x) => x.id === questionId);
    if (q) return q;
  }
  return undefined;
}
