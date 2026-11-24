-- Habits keep the order the owner drags them into (app, widget and reminders),
-- instead of moving done ones to the bottom.

alter table hm_habits add column if not exists sort_order integer not null default 0;

create or replace function hm_habits_today(p_hid uuid, p_day date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with d as (select p_day as day, extract(dow from p_day)::int as dow, (p_day - (extract(isodow from p_day)::int - 1)) as week_start),
  h as (
    select hb.*,
      coalesce((select sum(l.amount) from hm_habit_logs l where l.habit_id = hb.id and l.date = d.day), 0) as amount,
      (select count(*) from (select l.date from hm_habit_logs l where l.habit_id = hb.id and l.date >= d.week_start and l.date < d.day
                              group by l.date having sum(l.amount) >= hb.target) x) as week_before
    from hm_habits hb, d
    where hb.household_id = p_hid and not hb.archived
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'name', h.name, 'emoji', h.emoji, 'kind', h.kind, 'amount', h.amount, 'target', h.target,
      'unit', h.unit, 'step', h.step, 'done', h.amount >= h.target,
      'schedule', h.schedule, 'per_week', h.per_week, 'week_done', h.week_before + case when h.amount >= h.target then 1 else 0 end)
    order by h.sort_order, h.created_at), '[]'::jsonb)
  from h, d
  where h.schedule = 'daily'
     or (h.schedule = 'days' and h.days @> to_jsonb(d.dow))
     or (h.schedule = 'weekly' and (h.week_before < h.per_week or h.amount >= h.target));
$$;

create or replace function hm_push_habits(p_hid uuid, p_local timestamp)
returns text
language sql
stable
set search_path = public
as $$
  with d as (select p_local::date as day, extract(dow from p_local)::int as dow, extract(hour from p_local)::int as hr,
                    (p_local::date - ((extract(isodow from p_local)::int) - 1)) as week_start),
  h as (
    select hb.*,
      coalesce((select sum(l.amount) from hm_habit_logs l where l.habit_id = hb.id and l.date = d.day), 0) as today_amt,
      (select count(*) from (select l.date from hm_habit_logs l where l.habit_id = hb.id and l.date >= d.week_start and l.date <= d.day
                              group by l.date having sum(l.amount) >= hb.target) x) as week_days
    from hm_habits hb, d
    where hb.household_id = p_hid and not hb.archived and hb.reminder_hours @> to_jsonb(d.hr)
  )
  select nullif(string_agg(
    trim(both from h.emoji || ' ' || h.name) ||
      case when h.kind = 'count' and h.today_amt > 0 then ' (' || h.today_amt::float8::text || '/' || h.target::float8::text || coalesce(nullif(' ' || h.unit, ' '), '') || ')' else '' end,
    ' · ' order by h.sort_order, h.created_at), '')
  from h, d
  where h.today_amt < h.target
    and (h.schedule = 'daily'
      or (h.schedule = 'days' and h.days @> to_jsonb(d.dow))
      or (h.schedule = 'weekly' and h.week_days < h.per_week));
$$;
