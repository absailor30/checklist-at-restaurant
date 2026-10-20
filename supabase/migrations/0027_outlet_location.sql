-- A free-text location label per outlet (city, area, region). Reports group and filter by it; null = not set.
alter table outlets add column if not exists location text;
