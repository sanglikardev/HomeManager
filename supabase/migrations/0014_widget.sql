-- iPhone home-screen widget (Scriptable). Each account can make one private widget key;
-- only its sha256 is stored. hm_widget(key) returns a small summary for that home.

create table if not exists hm_widget_keys (
  key_hash text primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  account_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table hm_widget_keys enable row level security;

-- Makes a new key for this account (older ones stop working) and returns it once.
create or replace function hm_widget_key(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hid uuid := hm_household_for(p_token);
  v_acc uuid := hm_account_for(p_token);
  v_key text := encode(gen_random_bytes(18), 'hex');
begin
  if v_hid is null or v_acc is null then raise exception 'Please sign in again'; end if;
  update hm_widget_keys set active = false where account_id = v_acc;
  insert into hm_widget_keys (key_hash, household_id, account_id) values (encode(digest(v_key, 'sha256'), 'hex'), v_hid, v_acc);
  return v_key;
end;
$$;
grant execute on function hm_widget_key(text) to anon, authenticated;

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
  v_digest text;
begin
  select household_id into v_hid from hm_widget_keys
  where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and active;
  if v_hid is null then return jsonb_build_object('ok', false); end if;
  v_digest := hm_push_digest(v_hid, v_today);
  return jsonb_build_object(
    'ok', true,
    'home', (select name from hm_households where id = v_hid),
    'date', v_today,
    'meals', coalesce((select jsonb_agg(jsonb_build_object('slot', slot, 'label', coalesce(nullif(label, ''), kind)) order by case slot when 'breakfast' then 0 when 'lunch' then 1 else 2 end)
                       from hm_meals where household_id = v_hid and date = v_today), '[]'::jsonb),
    'items', case when v_digest is null then '[]'::jsonb else to_jsonb(string_to_array(v_digest, ' · ')) end,
    'next', (select jsonb_build_object('title', title, 'days', start_date - v_today) from hm_plans
             where household_id = v_hid and start_date >= v_today order by start_date limit 1)
  );
end;
$$;
grant execute on function hm_widget(text) to anon, authenticated;
