// Locked sample bank for L1 line check. Same 10 questions on every station.
// Open spec questions (q1–q6) are parked and not used.

export type QuestionKind =
  | 'yes_no'
  | 'yes_no_photo_on_no'
  | 'yes_no_photo_always'
  | 'numeric_photo'
  | 'yes_no_na'
  | 'yes_no_reason_on_no'
  | 'yes_photo_no_reason';

export type ExpectedYesNo = 'yes' | 'no';

export interface LineCheckQuestion {
  id: string;
  order: number;
  kind: QuestionKind;
  prompt: string;
  expected?: ExpectedYesNo;
  unit?: string;
  min?: number;
  max?: number;
  minInclusive?: boolean;
  photoRequired: boolean;
  reasonOnNo: boolean;
  notes?: string;
}

export const STATIONS = [
  { id: 1, name: 'Station 1' },
  { id: 2, name: 'Station 2' },
  { id: 3, name: 'Station 3' },
] as const;

export const L1_HARD_STOP = '12:00';

export const L1_QUESTIONS: LineCheckQuestion[] = [
  {
    id: 'q1-uniform',
    order: 1,
    kind: 'yes_no',
    prompt: 'Uniform clean, hair restrained, jewellery policy followed?',
    expected: 'yes',
    photoRequired: false,
    reasonOnNo: false,
  },
  {
    id: 'q2-pest',
    order: 2,
    kind: 'yes_no',
    prompt: 'Any pest activity seen in this station?',
    expected: 'no',
    photoRequired: false,
    reasonOnNo: false,
    notes: 'Negative phrasing — Yes is a fail.',
  },
  {
    id: 'q3-handwash',
    order: 3,
    kind: 'yes_photo_no_reason',
    prompt: 'Hand-wash station stocked (soap, paper, hot water)?',
    expected: 'yes',
    photoRequired: false,
    reasonOnNo: true,
    notes: 'Yes requires a photo. No requires a written reason.',
  },
  {
    id: 'q4-floor',
    order: 4,
    kind: 'yes_no_photo_on_no',
    prompt: 'Floor dry, no standing water or trip hazards?',
    expected: 'yes',
    photoRequired: false,
    reasonOnNo: false,
  },
  {
    id: 'q5-sanitiser',
    order: 5,
    kind: 'yes_no_photo_always',
    prompt: 'Probe-wipe sanitiser available and in date?',
    expected: 'yes',
    photoRequired: true,
    reasonOnNo: false,
  },
  {
    id: 'q6-allergen',
    order: 6,
    kind: 'yes_no_photo_always',
    prompt: 'Allergen matrix / prep labels visible and current?',
    expected: 'yes',
    photoRequired: true,
    reasonOnNo: false,
  },
  {
    id: 'q7-fridge',
    order: 7,
    kind: 'numeric_photo',
    prompt: 'Fridge core temp (°C). Range 0–5.',
    unit: '°C',
    min: 0,
    max: 5,
    minInclusive: true,
    photoRequired: true,
    reasonOnNo: false,
    notes: 'Any temperature reading requires a photo.',
  },
  {
    id: 'q8-hothold',
    order: 8,
    kind: 'numeric_photo',
    prompt: 'Hot-hold core temp (°C). Range ≥75.',
    unit: '°C',
    min: 75,
    minInclusive: true,
    photoRequired: true,
    reasonOnNo: false,
    notes: 'Any temperature reading requires a photo.',
  },
  {
    id: 'q9-delivery',
    order: 9,
    kind: 'yes_no_na',
    prompt: "Today's delivery received, checked, put away?",
    expected: 'yes',
    photoRequired: false,
    reasonOnNo: false,
    notes: 'N/A excluded from numerator and denominator.',
  },
  {
    id: 'q10-equipment',
    order: 10,
    kind: 'yes_no_reason_on_no',
    prompt: 'All station equipment working (no breakdowns)?',
    expected: 'yes',
    photoRequired: false,
    reasonOnNo: true,
  },
];
