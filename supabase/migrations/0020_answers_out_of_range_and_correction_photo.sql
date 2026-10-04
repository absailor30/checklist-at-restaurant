-- A temperature reading outside the acceptable range is recorded on the answer so
-- L2/L3 can be shown it at review; an optional second photo is taken after correction.
alter table line_check_answers add column if not exists out_of_range boolean not null default false;
alter table line_check_answers add column if not exists correction_photo_path text;
