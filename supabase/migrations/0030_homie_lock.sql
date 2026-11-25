-- Homie lock: the Claude connector stays locked until the person unlocks it with a PIN (for a shared
-- Claude account). PIN set in the app, stored as a bcrypt hash. Unlock lasts 20 minutes from the last use.
-- 5 wrong PINs in an hour lock it out for that hour. The app itself is not affected.

alter table hm_homie_settings add column if not exists pin_hash text;
alter table hm_homie_settings add column if not exists unlocked_until timestamptz;
alter table hm_homie_settings add column if not exists pin_fails int not null default 0;
alter table hm_homie_settings add column if not exists pin_fail_at timestamptz;

-- From the app: set a 4-8 digit PIN, or '' to remove it.
create or replace function hm_homie_set_pin(p_token text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_acc uuid := hm_private.homie_acc(p_token);
begin
  if coalesce(p_pin, '') <> '' and p_pin !~ '^[0-9]{4,8}$' then raise exception 'The PIN must be 4 to 8 digits'; end if;
  insert into hm_homie_settings (account_id) values (v_acc) on conflict (account_id) do nothing;
  update hm_homie_settings set pin_hash = case when coalesce(p_pin, '') = '' then null else crypt(p_pin, gen_salt('bf')) end,
    unlocked_until = null, pin_fails = 0, pin_fail_at = null, updated_at = now()
  where account_id = v_acc;
end $$;

-- Lock state for the connector. Each call while unlocked keeps it open for 20 more minutes.
create or replace function hm_homie_gate(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  r hm_homie_settings;
begin
  select * into r from hm_homie_settings where account_id = v_acc;
  if r.pin_hash is null then return jsonb_build_object('pin', false, 'unlocked', true); end if;
  if r.unlocked_until is not null and r.unlocked_until > now() then
    update hm_homie_settings set unlocked_until = now() + interval '20 minutes' where account_id = v_acc;
    return jsonb_build_object('pin', true, 'unlocked', true);
  end if;
  return jsonb_build_object('pin', true, 'unlocked', false);
end $$;

create or replace function hm_homie_unlock(p_token text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  r hm_homie_settings;
begin
  select * into r from hm_homie_settings where account_id = v_acc;
  if r.pin_hash is null then return jsonb_build_object('ok', true, 'reason', 'no_pin'); end if;
  if r.pin_fails >= 5 and r.pin_fail_at > now() - interval '1 hour' then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if crypt(coalesce(p_pin, ''), r.pin_hash) <> r.pin_hash then
    update hm_homie_settings set
      pin_fails = case when pin_fail_at > now() - interval '1 hour' then pin_fails + 1 else 1 end,
      pin_fail_at = now()
    where account_id = v_acc;
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;
  update hm_homie_settings set unlocked_until = now() + interval '20 minutes', pin_fails = 0, pin_fail_at = null where account_id = v_acc;
  return jsonb_build_object('ok', true);
end $$;

create or replace function hm_homie_lock(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update hm_homie_settings set unlocked_until = null where account_id = hm_private.homie_acc(p_token);
end $$;

-- For the app: is a PIN set, and is the connector open right now.
create or replace function hm_homie_lock_state(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r hm_homie_settings;
begin
  select * into r from hm_homie_settings where account_id = hm_private.homie_acc(p_token);
  return jsonb_build_object('pin', r.pin_hash is not null, 'unlockedUntil', case when r.unlocked_until > now() then r.unlocked_until end);
end $$;

-- What the daily scout may see while Homie is locked: interests, upcoming trips (where and when) and
-- the titles of its own earlier finds. Nothing else.
create or replace function hm_homie_scout_view(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_hid uuid := (select household_id from hm_household_members where account_id = v_acc order by joined_at limit 1);
  v_local timestamp := (now() at time zone 'utc') + make_interval(mins => hm_private.homie_tz(v_acc));
begin
  return jsonb_build_object(
    'now', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI'),
    'home', 'Bangalore',
    'tone', coalesce((select settings ->> 'tone' from hm_homie_settings where account_id = v_acc), 'firm'),
    'interests', coalesce((select settings -> 'interests' from hm_homie_settings where account_id = v_acc), '[]'::jsonb),
    'trips', (select coalesce(jsonb_agg(jsonb_build_object('destination', nullif(p.destination, ''), 'title', p.title, 'start', p.start_date, 'end', p.end_date) order by p.start_date), '[]'::jsonb)
      from hm_plans p where p.household_id = v_hid and p.kind in ('trip', 'holiday', 'event')
        and p.end_date >= v_local::date and p.start_date <= v_local::date + 180),
    'pastFinds', (select coalesce(jsonb_agg(left(i.text, 160) order by i.created_at desc), '[]'::jsonb)
      from (select text, created_at from hm_homie_items where account_id = v_acc and kind = 'note' and text like 'Scout: %'
              and not forgotten and created_at > now() - interval '120 days' order by created_at desc limit 80) i));
end $$;

-- From the signed-in app (never the connector key): open the connector for 20 minutes without a PIN.
create or replace function hm_homie_unlock_app(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_acc uuid := hm_private.homie_acc(p_token);
begin
  if exists (select 1 from hm_homie_settings where account_id = v_acc and siri_token = p_token) then raise exception 'not allowed'; end if;
  update hm_homie_settings set unlocked_until = now() + interval '20 minutes' where account_id = v_acc and pin_hash is not null;
  return hm_homie_lock_state(p_token);
end $$;
