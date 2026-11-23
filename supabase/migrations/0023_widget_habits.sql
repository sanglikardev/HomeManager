-- Habits on the iPhone widget: today's habits with progress (same rules as the app:
-- every day / some weekdays / N times a week until the week goal is met, or done today).

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
      'name', h.name, 'emoji', h.emoji, 'kind', h.kind, 'amount', h.amount, 'target', h.target, 'unit', h.unit,
      'done', h.amount >= h.target)
    order by (h.amount >= h.target), h.created_at), '[]'::jsonb)
  from h, d
  where h.schedule = 'daily'
     or (h.schedule = 'days' and h.days @> to_jsonb(d.dow))
     or (h.schedule = 'weekly' and (h.week_before < h.per_week or h.amount >= h.target));
$$;

create or replace function hm_widget(p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_hid uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select household_id into v_hid from hm_widget_keys
  where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and active;
  if v_hid is null then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object(
    'ok', true,
    'home', (select name from hm_households where id = v_hid),
    'date', v_today,
    'meals', coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'label', coalesce(nullif(label, ''), kind)) order by case slot when 'breakfast' then 0 when 'lunch' then 1 else 2 end)
                       from hm_meals where household_id = v_hid and date = v_today), '[]'::jsonb),
    'parts', hm_push_digest_parts(v_hid, v_today),
    'items', coalesce((select jsonb_agg(p->'text') from jsonb_array_elements(hm_push_digest_parts(v_hid, v_today)) p), '[]'::jsonb),
    'next', (select jsonb_build_object('title', title, 'days', start_date - v_today) from hm_plans
             where household_id = v_hid and start_date >= v_today order by start_date limit 1),
    'habits', hm_habits_today(v_hid, v_today)
  );
end;
$$;
