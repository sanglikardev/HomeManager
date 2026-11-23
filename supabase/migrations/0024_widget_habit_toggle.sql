-- Habits widget: tap a habit to tick it (or untick it) for today, using the widget key.
-- Check habit: not done -> log it; done -> remove today's ticks (logs with a note keep
-- their note, at amount 0). Count habit: below the goal -> add one step; at the goal ->
-- take back the last entry. "Today" is India time, like hm_widget.

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
    order by h.created_at), '[]'::jsonb)
  from h, d
  where h.schedule = 'daily'
     or (h.schedule = 'days' and h.days @> to_jsonb(d.dow))
     or (h.schedule = 'weekly' and (h.week_before < h.per_week or h.amount >= h.target));
$$;

create or replace function hm_widget_toggle(p_key text, p_habit uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hid uuid;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  h hm_habits;
  v_amt numeric;
begin
  select household_id into v_hid from hm_widget_keys
  where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and active;
  if v_hid is null then return jsonb_build_object('ok', false, 'reason', 'key'); end if;
  select * into h from hm_habits where id = p_habit and household_id = v_hid and not archived;
  if h.id is null then return jsonb_build_object('ok', false, 'reason', 'habit'); end if;

  select coalesce(sum(amount), 0) into v_amt from hm_habit_logs where habit_id = h.id and date = v_today;
  if v_amt >= h.target then
    if h.kind = 'check' then
      delete from hm_habit_logs where habit_id = h.id and date = v_today and note = '';
      update hm_habit_logs set amount = 0 where habit_id = h.id and date = v_today and amount <> 0;
    else
      delete from hm_habit_logs where id = (
        select id from hm_habit_logs where habit_id = h.id and date = v_today and amount > 0 and note = ''
        order by created_at desc limit 1);
    end if;
  else
    insert into hm_habit_logs (id, household_id, habit_id, date, amount, note, created_at)
    values (gen_random_uuid(), v_hid, h.id, v_today,
            case when h.kind = 'check' then h.target - v_amt else greatest(h.step, 1) end, '', now());
  end if;

  select coalesce(sum(amount), 0) into v_amt from hm_habit_logs where habit_id = h.id and date = v_today;
  return jsonb_build_object('ok', true, 'name', h.name, 'amount', v_amt, 'done', v_amt >= h.target);
end;
$$;
grant execute on function hm_widget_toggle(text, uuid) to anon, authenticated;
