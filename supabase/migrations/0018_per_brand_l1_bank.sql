-- Per-brand L1 checklist. A brand may define its own named stations and its
-- own L1 questions per station. Brands that don't are untouched: they keep the
-- global default bank (line_check_questions rows with org_id null) and the
-- 3-station layout. Everything here only adds columns or loosens a limit.

-- Brand-level settings: { "stationNames": ["Savory Kitchen", ...], "hardStop": "none" | "HH:MM" }.
-- An empty object means "defaults" (Station 1..N, 12:00 hard stop).
alter table organisations
  add column if not exists line_check_config jsonb not null default '{}'::jsonb;

-- Which station a brand-specific L1 question belongs to. Null for the global
-- default bank, which applies to every station.
alter table line_check_questions
  add column if not exists station_no integer;

-- The 3-station cap was a default, not a rule; a bakery can have 13 sections.
alter table outlets drop constraint if exists outlets_station_count_check;
alter table outlets add constraint outlets_station_count_check
  check (station_count >= 1 and station_count <= 30);

alter table line_check_stations drop constraint if exists line_check_stations_station_no_check;
alter table line_check_stations add constraint line_check_stations_station_no_check
  check (station_no between 1 and 30);
