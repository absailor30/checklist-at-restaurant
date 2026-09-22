-- Corrective actions: closing the loop on a flagged/failed answer, instead
-- of the flag just sitting there. Auto-created (see /api/l1/line-check/sync
-- and /api/manager/line-check/submit) whenever an answer is flagged, and
-- assigned one tier up (L1 -> L2, L2 -> L3, L3 flags stay with L3).

create table if not exists corrective_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  source text not null check (source in ('l1','l2','l3')),
  question_id text not null,
  description text not null,
  assigned_role text not null check (assigned_role in ('L1 Manager','L2 Manager','L3 Owner')),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_note text
);

alter table corrective_actions enable row level security;

create policy "Users can view corrective actions for their org" on corrective_actions
  for select to authenticated using (org_id = current_org_id());

create policy "Users can update corrective actions for their org" on corrective_actions
  for update to authenticated using (org_id = current_org_id());
