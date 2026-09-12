-- Two additions drawn from a real line-check audit.
--
-- 1. Multi-value checks. One equipment check often carries several readings —
--    an oven with a top element, a bottom element and a belt speed. Forcing
--    three separate checks loses the fact that they are one piece of equipment
--    inspected once.
--
-- 2. Front-camera photos. An audit that asks for a selfie at the station is
--    proving the person was physically there, which a photo of a fridge does
--    not. It is still a photo, so this is a facing hint rather than a new
--    proof type — and adding an enum value cannot run inside a transaction,
--    which is how migrations are applied here.

alter table checklist_items
  add column if not exists readings jsonb,
  add column if not exists photo_facing text not null default 'environment';

alter table submissions
  add column if not exists value_readings jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'checklist_items_photo_facing_check'
  ) then
    alter table checklist_items
      add constraint checklist_items_photo_facing_check
      check (photo_facing in ('environment', 'user'));
  end if;
end $$;

comment on column checklist_items.readings is
  'Optional array of named readings for a single check: '
  '[{"label":"Top element","min":390,"max":420,"unit":"°C"}, ...]. '
  'When present, the item collects one value per entry instead of a single number.';

comment on column checklist_items.photo_facing is
  'Which camera a photo check should open: environment (rear, the default, for '
  'photographing equipment) or user (front, for proving the person is present).';

comment on column submissions.value_readings is
  'Values for a multi-reading check, as [{"label":"Top element","value":402}, ...].';
