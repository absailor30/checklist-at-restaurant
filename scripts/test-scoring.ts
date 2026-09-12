/**
 * Tests the compliance scoring rules. These decide the number an owner acts
 * on, so the edge cases — a waived check, a re-taken reading, a check never
 * done at all — need to be pinned down rather than assumed.
 */
import { scoreOf, scoreDate, compare } from '../src/lib/scoring';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) {
    console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures++;
  }
}

console.log('scoreOf');
check('a check never done scores 0', scoreOf(undefined), 0);
check('a completed check scores 1',
  scoreOf({ run_id: 'r', checklist_item_id: 'i', status: 'submitted', out_of_bounds: false }), 1);
check('an approved check scores 1',
  scoreOf({ run_id: 'r', checklist_item_id: 'i', status: 'approved', out_of_bounds: false }), 1);
check('a rejected check scores 0',
  scoreOf({ run_id: 'r', checklist_item_id: 'i', status: 'rejected', out_of_bounds: false }), 0);
check('an out-of-range reading scores 0 even when approved',
  scoreOf({ run_id: 'r', checklist_item_id: 'i', status: 'approved', out_of_bounds: true }), 0);
check('a waived check is excluded, not scored',
  scoreOf({ run_id: 'r', checklist_item_id: 'i', status: 'waived', out_of_bounds: false }), null);
check('a manager completion scores 1',
  scoreOf({ run_id: 'r', checklist_item_id: 'i', status: 'completed_by_manager', out_of_bounds: false }), 1);

console.log('\nscoreDate');
const runs = [
  { id: 'r1', outlet_id: 'o1', template_id: 't1', run_date: '2026-09-12' },
  { id: 'r2', outlet_id: 'o1', template_id: 't2', run_date: '2026-09-12' },
];
const items = [
  { id: 'a', template_id: 't1' }, { id: 'b', template_id: 't1' },
  { id: 'c', template_id: 't1' }, { id: 'd', template_id: 't2' },
];
const sectionOf = (r: any) => (r.template_id === 't1' ? 'Kitchen' : 'Bar');

const day = scoreDate({
  date: '2026-09-12',
  runs, items,
  submissions: [
    { run_id: 'r1', checklist_item_id: 'a', status: 'approved', out_of_bounds: false },
    { run_id: 'r1', checklist_item_id: 'b', status: 'approved', out_of_bounds: true },
    { run_id: 'r1', checklist_item_id: 'c', status: 'waived', out_of_bounds: false },
    { run_id: 'r2', checklist_item_id: 'd', status: 'submitted', out_of_bounds: false },
  ],
  sectionOf,
});

check('kitchen: one pass, one fail, one waived → 50%',
  day.sections.find((s) => s.section === 'Kitchen'),
  { section: 'Kitchen', scored: 2, points: 1, waived: 1, percent: 50 });
check('bar: single pass → 100%',
  day.sections.find((s) => s.section === 'Bar'),
  { section: 'Bar', scored: 1, points: 1, waived: 0, percent: 100 });
check('overall counts 3 scored of 4 checks', [day.overall.scored, day.overall.points], [3, 2]);
check('overall percent is 66.7', day.overall.percent, 66.7);
check('worst section is listed first', day.sections[0].section, 'Kitchen');

console.log('\nre-taken readings');
const retaken = scoreDate({
  date: '2026-09-12',
  runs: [runs[0]],
  items: [{ id: 'a', template_id: 't1' }],
  submissions: [
    // The original out-of-range reading, replaced by a good one.
    { run_id: 'r1', checklist_item_id: 'a', status: 'submitted', out_of_bounds: true, superseded_by: 'x' },
    { run_id: 'r1', checklist_item_id: 'a', status: 'submitted', out_of_bounds: false },
  ],
  sectionOf,
});
check('a re-taken reading counts once, and the replacement stands',
  [retaken.overall.scored, retaken.overall.points], [1, 1]);

console.log('\nmissing work');
const missed = scoreDate({
  date: '2026-09-12', runs: [runs[0]],
  items: [{ id: 'a', template_id: 't1' }, { id: 'b', template_id: 't1' }],
  submissions: [], sectionOf,
});
check('checks never done score zero', missed.overall.percent, 0);

console.log('\ncompare');
const previous = scoreDate({
  date: '2026-09-11', runs: [{ ...runs[0], run_date: '2026-09-11' }],
  items: [{ id: 'a', template_id: 't1' }, { id: 'b', template_id: 't1' }],
  submissions: [
    { run_id: 'r1', checklist_item_id: 'a', status: 'approved', out_of_bounds: false },
    { run_id: 'r1', checklist_item_id: 'b', status: 'approved', out_of_bounds: false },
  ],
  sectionOf,
});
const diff = compare(day, previous);
check('change against the previous inspection', diff.overall.change, round(66.7 - 100));
check('previous date is carried through', diff.previousDate, '2026-09-11');

const noPrevious = compare(day, undefined);
check('no previous inspection gives no change, not a fake zero', noPrevious.overall.change, null);

function round(n: number) { return Math.round(n * 10) / 10; }

console.log(`\n${failures === 0 ? 'ALL SCORING TESTS PASSED' : `${failures} FAILURES`}`);
process.exit(failures === 0 ? 0 : 1);
