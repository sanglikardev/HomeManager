-- The morning summary as parts with the screen each one belongs to, so widget lines can
-- open the right screen. hm_push_digest is now built from these parts.

create or replace function hm_push_digest_parts(p_hid uuid, p_today date)
returns jsonb
language sql
stable
set search_path = public
as $$
  with
  bills as (select name from hm_bills where household_id = p_hid and active and next_due - remind_days <= p_today),
  upkeep as (
    select name from (
      select name, remind_days, case when kind = 'renewal' then due_date else last_done + interval_days end as due
      from hm_upkeep where household_id = p_hid) u
    where due is not null and due - remind_days <= p_today),
  docs as (
    select title from hm_docs where household_id = p_hid and expiry_date is not null
      and expiry_date - remind_days <= p_today
      and (expiry_date >= p_today or (category <> 'appliance' and expiry_date >= p_today - 60))),
  tasks as (
    select t->>'text' as text from hm_plans p, jsonb_array_elements(p.checklist) t
    where p.household_id = p_hid and not coalesce((t->>'done')::boolean, false)
      and nullif(t->>'due', '') is not null and (t->>'due')::date <= p_today),
  off as (
    select name from hm_staff where household_id = p_hid and active
      and (leaves ? p_today::text or weekly_off @> to_jsonb(extract(dow from p_today)::int))),
  shop as (select count(*) as n from hm_shopping where household_id = p_hid and status = 'needed'),
  parts(ord, screen, text) as (
    select 1, 'money', (select case count(*) when 0 then null when 1 then max(name) || ' bill due' else count(*) || ' bills due' end from bills)
    union all select 2, 'upkeep', (select case count(*) when 0 then null when 1 then max(name) || ' due' else count(*) || ' upkeep tasks due' end from upkeep)
    union all select 3, 'docs', (select case count(*) when 0 then null when 1 then max(title) || ' expiring' else count(*) || ' documents expiring' end from docs)
    union all select 4, 'plans', (select case count(*) when 0 then null when 1 then max(text) else count(*) || ' plan tasks' end from tasks)
    union all select 5, 'help', (select case count(*) when 0 then null else string_agg(name, ', ') || ' off today' end from off)
    union all select 6, 'shopping', (select case when n = 0 then null else n || ' to buy' end from shop)
  )
  select coalesce(jsonb_agg(jsonb_build_object('screen', screen, 'text', text) order by ord) filter (where text is not null), '[]'::jsonb) from parts;
$$;

create or replace function hm_push_digest(p_hid uuid, p_today date)
returns text
language sql
stable
set search_path = public
as $$
  select nullif(string_agg(p->>'text', ' · '), '') from jsonb_array_elements(hm_push_digest_parts(p_hid, p_today)) p;
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
             where household_id = v_hid and start_date >= v_today order by start_date limit 1)
  );
end;
$$;
