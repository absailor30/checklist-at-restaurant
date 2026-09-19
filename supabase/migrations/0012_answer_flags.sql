-- Uniform response UI: every question gets Yes/No/N/A plus optional Comment,
-- Media and Flag. Comment and Media already exist (reason, photo_path);
-- Flag is new.

alter table line_check_answers add column if not exists flagged boolean not null default false;
alter table line_check_manager_answers add column if not exists flagged boolean not null default false;
