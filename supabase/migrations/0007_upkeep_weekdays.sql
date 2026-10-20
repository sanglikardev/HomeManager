-- Weekdays a recurring upkeep task shows up on in the weekly routine (0 = Sunday).
alter table hm_upkeep add column if not exists weekdays jsonb not null default '[]'::jsonb;
