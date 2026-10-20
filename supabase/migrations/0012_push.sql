-- Phone notifications (Web Push). The Worker's hourly cron calls hm_push_due with the
-- PUSH_SECRET Worker secret; its sha256 is hm_config 'push_secret_hash'. The VAPID
-- private key (JWK) is hm_config 'vapid_private_jwk'. Neither is in this repo.

create table if not exists hm_push_subs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references hm_households(id) on delete cascade,
  account_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  hour integer not null default 8 check (hour between 0 and 23), -- local hour for the morning summary
  tz_offset_min integer not null default 330,                    -- minutes east of UTC (India = 330)
  active boolean not null default true,
  last_digest date,
  created_at timestamptz not null default now()
);
alter table hm_push_subs enable row level security;

-- One line per kind of thing that needs attention today, for the morning summary.
-- Runs with the caller's rights: called directly with the public key it sees nothing (RLS).
create or replace function hm_push_digest(p_hid uuid, p_today date)
returns text
language sql
stable
set search_path = public
as $$
  with
  bills as (select name from hm_bills where household_id = p_hid and active and next_due - remind_days <= p_today order by next_due),
  upkeep as (
    select name from (
      select name, remind_days, case when kind = 'renewal' then due_date else last_done + interval_days end as due
      from hm_upkeep where household_id = p_hid) u
    where due is not null and due - remind_days <= p_today order by due),
  docs as (
    select title from hm_docs where household_id = p_hid and expiry_date is not null
      and expiry_date - remind_days <= p_today
      and (expiry_date >= p_today or (category <> 'appliance' and expiry_date >= p_today - 60))
    order by expiry_date),
  tasks as (
    select t->>'text' as text from hm_plans p, jsonb_array_elements(p.checklist) t
    where p.household_id = p_hid and not coalesce((t->>'done')::boolean, false)
      and nullif(t->>'due', '') is not null and (t->>'due')::date <= p_today),
  off as (
    select name from hm_staff where household_id = p_hid and active
      and (leaves ? p_today::text or weekly_off @> to_jsonb(extract(dow from p_today)::int))),
  shop as (select count(*) as n from hm_shopping where household_id = p_hid and status = 'needed')
  select nullif(concat_ws(' · ',
    (select case count(*) when 0 then null when 1 then max(name) || ' bill due' else count(*) || ' bills due' end from bills),
    (select case count(*) when 0 then null when 1 then max(name) || ' due' else count(*) || ' upkeep tasks due' end from upkeep),
    (select case count(*) when 0 then null when 1 then max(title) || ' expiring' else count(*) || ' documents expiring' end from docs),
    (select case count(*) when 0 then null when 1 then max(text) else count(*) || ' plan tasks' end from tasks),
    (select case count(*) when 0 then null else string_agg(name, ', ') || ' off today' end from off),
    (select case when n = 0 then null else n || ' to buy' end from shop)
  ), '');
$$;

create or replace function hm_push_secret_ok(p_secret text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select coalesce(p_secret <> '' and encode(digest(p_secret, 'sha256'), 'hex') = (select value from hm_config where key = 'push_secret_hash'), false);
$$;

-- Morning summaries that are due now (local hour reached, not sent yet today). Marks them sent.
create or replace function hm_push_due(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  r record;
  v_local timestamp;
  v_body text;
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  for r in select * from hm_push_subs where active loop
    v_local := (now() at time zone 'utc') + make_interval(mins => r.tz_offset_min);
    if extract(hour from v_local) < r.hour or r.last_digest >= v_local::date then continue; end if;
    update hm_push_subs set last_digest = v_local::date where id = r.id;
    v_body := hm_push_digest(r.household_id, v_local::date);
    if v_body is null then continue; end if;
    v_items := v_items || jsonb_build_object('id', r.id, 'endpoint', r.endpoint, 'p256dh', r.p256dh, 'auth', r.auth,
      'title', 'Today at home', 'body', v_body);
  end loop;
  return jsonb_build_object('vapid', (select value from hm_config where key = 'vapid_private_jwk')::jsonb, 'items', v_items);
end;
$$;
grant execute on function hm_push_due(text) to anon, authenticated;

-- "Send a test" from Settings: this account's own subscriptions, with today's summary.
create or replace function hm_push_test(p_secret text, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_acc uuid := hm_account_for(p_token);
  v_body text;
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  if v_acc is null then raise exception 'Please sign in again'; end if;
  v_body := coalesce(hm_push_digest(hm_household_for(p_token), (now() at time zone 'Asia/Kolkata')::date), 'Nothing needs you today.');
  return jsonb_build_object(
    'vapid', (select value from hm_config where key = 'vapid_private_jwk')::jsonb,
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'endpoint', endpoint, 'p256dh', p256dh, 'auth', auth,
      'title', 'Notifications are on', 'body', v_body)) from hm_push_subs where account_id = v_acc and active), '[]'::jsonb));
end;
$$;
grant execute on function hm_push_test(text, text) to anon, authenticated;

create or replace function hm_push_gone(p_secret text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  update hm_push_subs set active = false where id = any(p_ids);
end;
$$;
grant execute on function hm_push_gone(text, uuid[]) to anon, authenticated;

create or replace function hm_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_hour integer, p_tz integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid := hm_household_for(p_token);
  v_acc uuid := hm_account_for(p_token);
begin
  if v_hid is null or v_acc is null then raise exception 'Please sign in again'; end if;
  insert into hm_push_subs (household_id, account_id, endpoint, p256dh, auth, hour, tz_offset_min, active)
  values (v_hid, v_acc, p_endpoint, p_p256dh, p_auth, greatest(0, least(23, p_hour)), p_tz, true)
  on conflict (endpoint) do update set household_id = v_hid, account_id = v_acc, p256dh = excluded.p256dh, auth = excluded.auth,
    hour = excluded.hour, tz_offset_min = excluded.tz_offset_min, active = true;
end;
$$;
grant execute on function hm_push_subscribe(text, text, text, text, integer, integer) to anon, authenticated;

create or replace function hm_push_unsubscribe(p_token text, p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  update hm_push_subs set active = false where endpoint = p_endpoint and account_id = hm_account_for(p_token);
$$;
grant execute on function hm_push_unsubscribe(text, text) to anon, authenticated;

create or replace function hm_push_status(p_token text, p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('active', coalesce(bool_or(active), false), 'hour', max(hour))
  from hm_push_subs where endpoint = p_endpoint and account_id = hm_account_for(p_token);
$$;
grant execute on function hm_push_status(text, text) to anon, authenticated;
