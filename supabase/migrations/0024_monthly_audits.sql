-- Monthly L2 audit: one per outlet per month, answers saved as the auditor goes.
create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  outlet_id uuid not null references outlets(id) on delete cascade,
  period text not null,
  status text not null default 'in_progress',
  auditor_id uuid references users(id),
  score numeric,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (outlet_id, period)
);
create table if not exists audit_answers (
  audit_id uuid not null references audits(id) on delete cascade,
  question_id text not null,
  yes_no text,
  comment text,
  primary key (audit_id, question_id)
);
alter table audits enable row level security;
alter table audit_answers enable row level security;
