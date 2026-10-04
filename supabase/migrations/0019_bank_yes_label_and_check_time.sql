-- Optional custom label for the "Yes" answer on a question (e.g. "Yes (Ambient, cool)"). The stored answer stays 'yes'.
alter table line_check_questions add column if not exists yes_label text;

-- The local time (HH:MM, 24h) the L1 said the check was carried out, for brands that ask for it.
alter table line_check_runs add column if not exists check_time text
  check (check_time is null or check_time ~ '^[0-2][0-9]:[0-5][0-9]$');
