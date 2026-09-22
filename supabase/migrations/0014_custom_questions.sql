-- Custom checklist builder for L2/L3: an org can add its own questions on
-- top of the global defaults. Global rows (org_id null) are never touched
-- or removed — a custom question is purely additive, scoped to one org.
alter table line_check_questions add column if not exists org_id uuid references organisations(id) on delete cascade;

drop policy if exists "Authenticated users can view questions" on line_check_questions;

create policy "Users can view global and their own org's questions" on line_check_questions
  for select to authenticated using (org_id is null or org_id = current_org_id());

create policy "Users can add questions to their own org" on line_check_questions
  for insert to authenticated with check (org_id = current_org_id());
