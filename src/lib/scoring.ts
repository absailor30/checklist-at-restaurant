// Compliance scoring, in the shape a line-check audit uses: every check scores
// 1 or 0, rolled up per section and compared against the previous inspection.
//
// Completion and compliance are different questions, and conflating them is how
// a dashboard flatters a restaurant. "All 40 checks done" says nothing if the
// freezer read −8°C in one of them. A check counts as compliant only when it
// was actually done and the result was acceptable.

export interface ScoredSubmission {
  run_id: string;
  checklist_item_id: string;
  status: string;
  out_of_bounds: boolean;
  superseded_by?: string | null;
}

export interface ScoredRun {
  id: string;
  outlet_id: string;
  template_id: string;
  run_date: string;
}

export interface ScoredItem {
  id: string;
  template_id: string;
}

export interface SectionScore {
  section: string;
  scored: number;      // checks that counted towards the score
  points: number;      // checks that passed
  waived: number;      // excluded: genuinely not applicable
  percent: number;
}

export interface ScoreBreakdown {
  date: string;
  sections: SectionScore[];
  overall: SectionScore;
}

/**
 * Whether one check passed.
 *
 * Waived checks return null — excluded from the score entirely rather than
 * counted as either a pass or a fail. A delivery that never arrived should not
 * be scored as a failure, and should certainly not be scored as a success.
 */
export function scoreOf(submission: ScoredSubmission | undefined): 1 | 0 | null {
  if (!submission) return 0;                       // never done: a failure
  if (submission.status === 'waived') return null; // not applicable
  if (submission.status === 'rejected') return 0;  // the manager sent it back
  if (submission.out_of_bounds) return 0;          // done, but the result failed
  return 1;
}

/**
 * Rolls scores up by section for one date. `sectionOf` decides what a section
 * is — the department in this app, the station in the audit this mirrors.
 */
export function scoreDate(opts: {
  date: string;
  runs: ScoredRun[];
  items: ScoredItem[];
  submissions: ScoredSubmission[];
  sectionOf: (run: ScoredRun) => string;
  outletId?: string;
}): ScoreBreakdown {
  const runs = opts.runs.filter(
    (r) => r.run_date === opts.date && (!opts.outletId || r.outlet_id === opts.outletId)
  );

  // Only live submissions count. A reading that was re-taken is one check, and
  // the replacement is the one that stands.
  const live = opts.submissions.filter((s) => !s.superseded_by);
  const byKey = new Map(live.map((s) => [`${s.run_id}:${s.checklist_item_id}`, s]));

  const itemsByTemplate = new Map<string, ScoredItem[]>();
  for (const item of opts.items) {
    const list = itemsByTemplate.get(item.template_id) ?? [];
    list.push(item);
    itemsByTemplate.set(item.template_id, list);
  }

  const sections = new Map<string, { scored: number; points: number; waived: number }>();

  for (const run of runs) {
    const section = opts.sectionOf(run);
    const bucket = sections.get(section) ?? { scored: 0, points: 0, waived: 0 };

    for (const item of itemsByTemplate.get(run.template_id) ?? []) {
      const score = scoreOf(byKey.get(`${run.id}:${item.id}`));
      if (score === null) {
        bucket.waived++;
      } else {
        bucket.scored++;
        bucket.points += score;
      }
    }
    sections.set(section, bucket);
  }

  const rows: SectionScore[] = [...sections.entries()]
    .map(([section, b]) => ({
      section,
      scored: b.scored,
      points: b.points,
      waived: b.waived,
      percent: b.scored ? round1((b.points / b.scored) * 100) : 100,
    }))
    .sort((a, b) => a.percent - b.percent || a.section.localeCompare(b.section));

  const totals = rows.reduce(
    (acc, r) => ({
      scored: acc.scored + r.scored,
      points: acc.points + r.points,
      waived: acc.waived + r.waived,
    }),
    { scored: 0, points: 0, waived: 0 }
  );

  return {
    date: opts.date,
    sections: rows,
    overall: {
      section: 'Overall',
      ...totals,
      percent: totals.scored ? round1((totals.points / totals.scored) * 100) : 100,
    },
  };
}

/** The change in each section between two inspections, newest first. */
export function compare(current: ScoreBreakdown, previous?: ScoreBreakdown) {
  const before = new Map((previous?.sections ?? []).map((s) => [s.section, s.percent]));

  return {
    date: current.date,
    previousDate: previous?.date ?? null,
    sections: current.sections.map((s) => {
      const was = before.get(s.section);
      return {
        ...s,
        previous: was ?? null,
        change: was === undefined ? null : round1(s.percent - was),
      };
    }),
    overall: {
      ...current.overall,
      previous: previous?.overall.percent ?? null,
      change: previous ? round1(current.overall.percent - previous.overall.percent) : null,
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
