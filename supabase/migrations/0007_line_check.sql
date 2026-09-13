-- Line check: L1 stations, independent pause/resume, 12:00 hard stop.

create table if not exists line_check_questions (
  id text primary key,
  level text not null check (level in ('L1', 'L2', 'L3')),
  sort_order integer not null,
  kind text not null,
  prompt text not null,
  expected text,
  unit text,
  min_value numeric,
  max_value numeric,
  photo_required boolean not null default false,
  reason_on_no boolean not null default false,
  notes text
);

create table if not exists line_check_runs (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null,
  run_date date not null,
  created_at timestamptz not null default now(),
  unique (outlet_id, run_date)
);

create table if not exists line_check_stations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references line_check_runs(id) on delete cascade,
  station_no integer not null check (station_no in (1, 2, 3)),
  status text not null default 'idle'
    check (status in ('idle', 'in_progress', 'paused', 'complete', 'missed')),
  pause_reason text,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  unique (run_id, station_no)
);

create table if not exists line_check_answers (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references line_check_stations(id) on delete cascade,
  question_id text not null references line_check_questions(id),
  yes_no text check (yes_no in ('yes', 'no', 'na')),
  value_number numeric,
  photo_path text,
  reason text,
  submitted_at timestamptz not null default now(),
  unique (station_id, question_id)
);

insert into line_check_questions
  (id, level, sort_order, kind, prompt, expected, unit, min_value, max_value, photo_required, reason_on_no, notes)
values
  ('q1-uniform', 'L1', 1, 'yes_no',
   'Uniform clean, hair restrained, jewellery policy followed?', 'yes', null, null, null, false, false, null),
  ('q2-pest', 'L1', 2, 'yes_no',
   'Any pest activity seen in this station?', 'no', null, null, null, false, false,
   'Negative phrasing — Yes is a fail.'),
  ('q3-handwash', 'L1', 3, 'yes_photo_no_reason',
   'Hand-wash station stocked (soap, paper, hot water)?', 'yes', null, null, null, false, true,
   'Yes requires a photo. No requires a written reason.'),
  ('q4-floor', 'L1', 4, 'yes_no_photo_on_no',
   'Floor dry, no standing water or trip hazards?', 'yes', null, null, null, false, false, null),
  ('q5-sanitiser', 'L1', 5, 'yes_no_photo_always',
   'Probe-wipe sanitiser available and in date?', 'yes', null, null, null, true, false, null),
  ('q6-allergen', 'L1', 6, 'yes_no_photo_always',
   'Allergen matrix / prep labels visible and current?', 'yes', null, null, null, true, false, null),
  ('q7-fridge', 'L1', 7, 'numeric_photo',
   'Fridge core temp (°C). Range 0–5.', null, '°C', 0, 5, true, false,
   'Any temperature reading requires a photo.'),
  ('q8-hothold', 'L1', 8, 'numeric_photo',
   'Hot-hold core temp (°C). Range ≥75.', null, '°C', 75, null, true, false,
   'Any temperature reading requires a photo.'),
  ('q9-delivery', 'L1', 9, 'yes_no_na',
   'Today''s delivery received, checked, put away?', 'yes', null, null, null, false, false,
   'N/A excluded from numerator and denominator.'),
  ('q10-equipment', 'L1', 10, 'yes_no_reason_on_no',
   'All station equipment working (no breakdowns)?', 'yes', null, null, null, false, true, null)
on conflict (id) do update set
  kind = excluded.kind,
  prompt = excluded.prompt,
  expected = excluded.expected,
  unit = excluded.unit,
  min_value = excluded.min_value,
  max_value = excluded.max_value,
  photo_required = excluded.photo_required,
  reason_on_no = excluded.reason_on_no,
  notes = excluded.notes;
