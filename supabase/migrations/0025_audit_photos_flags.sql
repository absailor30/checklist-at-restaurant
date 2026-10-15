alter table audit_answers add column if not exists photo_path text;
alter table audit_answers add column if not exists flagged boolean not null default false;
-- Bakelore's three temperature questions in the FSSAI audit need a photo.
update line_check_questions set photo_required = true where id in ('bkl2-10','bkl2-11','bkl2-12');
