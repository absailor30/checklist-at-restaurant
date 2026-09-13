-- Add L2 and L3 columns to line_check_runs
alter table line_check_runs
add column if not exists l2_completed_at timestamptz,
add column if not exists l3_completed_at timestamptz;

-- Create line_check_manager_answers
create table if not exists line_check_manager_answers (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references line_check_runs(id) on delete cascade,
  question_id text not null references line_check_questions(id),
  yes_no text check (yes_no in ('yes', 'no', 'na')),
  value_number numeric,
  photo_path text,
  reason text,
  submitted_at timestamptz default now(),
  unique (run_id, question_id)
);

-- RLS for line_check_manager_answers
alter table line_check_manager_answers enable row level security;

create policy "Users can view manager answers for their org" on line_check_manager_answers
  for select to authenticated using (
    exists (
      select 1 from line_check_runs r
      join outlets o on r.outlet_id = o.id
      where r.id = line_check_manager_answers.run_id and o.org_id = current_org_id()
    )
  );

create policy "Users can insert manager answers for their org" on line_check_manager_answers
  for insert to authenticated with check (
    exists (
      select 1 from line_check_runs r
      join outlets o on r.outlet_id = o.id
      where r.id = line_check_manager_answers.run_id and o.org_id = current_org_id()
    )
  );

create policy "Users can update manager answers for their org" on line_check_manager_answers
  for update to authenticated using (
    exists (
      select 1 from line_check_runs r
      join outlets o on r.outlet_id = o.id
      where r.id = line_check_manager_answers.run_id and o.org_id = current_org_id()
    )
  );

-- Insert placeholder questions for L2 and L3
insert into line_check_questions 
  (id, level, sort_order, kind, prompt, expected, photo_required, reason_on_no)
values
  ('l2-q1', 'L2', 1, 'yes_no', 'Are all L1 checklists completed accurately?', 'yes', false, false),
  ('l2-q2', 'L2', 2, 'yes_no', 'Are staff properly briefed for the shift?', 'yes', false, false),
  ('l2-q3', 'L2', 3, 'yes_no', 'Is the kitchen and dining area clean and organized?', 'yes', false, false),
  ('l2-q4', 'L2', 4, 'yes_no', 'Are inventory levels sufficient for the day?', 'yes', false, false),
  ('l2-q5', 'L2', 5, 'yes_no', 'Is all necessary equipment functional?', 'yes', false, false),
  ('l3-q1', 'L3', 1, 'yes_no', 'Are all L2 checklists completed accurately?', 'yes', false, false),
  ('l3-q2', 'L3', 2, 'yes_no', 'Are there any ongoing staff issues?', 'no', false, false),
  ('l3-q3', 'L3', 3, 'yes_no', 'Are the cash registers balanced?', 'yes', false, false),
  ('l3-q4', 'L3', 4, 'yes_no', 'Any major customer complaints recently?', 'no', false, false),
  ('l3-q5', 'L3', 5, 'yes_no', 'Any maintenance issues pending?', 'no', false, false)
on conflict (id) do nothing;
