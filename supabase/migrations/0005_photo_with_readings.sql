-- A reading and a photo of the reading are different pieces of evidence, and a
-- fridge log wants both: the number to trend, and the picture of the display
-- that proves the number was not invented at the end of the shift.
--
-- `proof` stays as the item's primary input. `photo_mode` is independent, so a
-- numeric or text item can also demand a photograph.

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'photo_mode'
  ) then
    create type photo_mode as enum ('none', 'optional', 'required');
  end if;
end $$;

alter table checklist_items
  add column if not exists photo_mode photo_mode not null default 'none';

-- Items whose primary proof is already a photograph do not need a second one.
update checklist_items
   set photo_mode = 'none'
 where proof = 'photo';

comment on column checklist_items.photo_mode is
  'Whether a photo accompanies this item in addition to its primary proof. '
  'Items with proof = photo use the photo as their primary evidence instead.';
