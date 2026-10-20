-- Manual priority order for upkeep tasks (lower = higher on the list).
alter table hm_upkeep add column if not exists sort_order integer;
