-- Applied 2026-10-20 as homemanager_0003_accounts (everything except
-- hm_logout, hm_delete and the revokes, which were run in the SQL editor).
--
-- Switch HomeManager from Supabase Auth to its own username + password
-- accounts (same approach as the Samarth apps: login returns a token, and
-- every read or write goes through a SECURITY DEFINER function that checks
-- it). The first login with a new username creates that account.
--
-- Data goes only through these functions; the hm_ tables give the anon key
-- no access (RLS on, and no policies for anon).

-- ---------- accounts and sessions ----------

create table if not exists hm_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists hm_sessions (
  token text primary key,
  account_id uuid not null references hm_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists hm_sessions_account_idx on hm_sessions(account_id);

alter table hm_accounts enable row level security;
alter table hm_sessions enable row level security;

-- Membership by account. (hm_members, tied to Supabase Auth users, is left
-- unused along with its old policies and functions; drop them in a cleanup.)
create table if not exists hm_household_members (
  household_id uuid not null references hm_households(id) on delete cascade,
  account_id uuid not null references hm_accounts(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, account_id)
);
create index if not exists hm_household_members_account_idx on hm_household_members(account_id);
alter table hm_household_members enable row level security;

-- ---------- helpers ----------

create or replace function hm_account_for(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select account_id from hm_sessions where token = p_token;
$$;

create or replace function hm_household_for(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.household_id
  from hm_sessions s join hm_household_members m on m.account_id = s.account_id
  where s.token = p_token
  order by m.joined_at
  limit 1;
$$;

-- ---------- login ----------

-- Signs in, or creates the account if the username is new. Returns a token.
create or replace function hm_login(p_username text, p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := lower(trim(p_username));
  v_acc hm_accounts;
  v_token text;
begin
  if v_name = '' or coalesce(p_password, '') = '' then
    raise exception 'Enter a username and password';
  end if;
  select * into v_acc from hm_accounts where username = v_name;
  if v_acc.id is null then
    insert into hm_accounts (username, password_hash)
    values (v_name, crypt(p_password, gen_salt('bf')))
    returning * into v_acc;
  elsif v_acc.password_hash <> crypt(p_password, v_acc.password_hash) then
    raise exception 'Wrong password for %', v_name;
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into hm_sessions (token, account_id) values (v_token, v_acc.id);
  return v_token;
end;
$$;

create or replace function hm_logout(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from hm_sessions where token = p_token;
$$;

create or replace function hm_whoami(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.username from hm_sessions s join hm_accounts a on a.id = s.account_id where s.token = p_token;
$$;

-- ---------- household ----------

create or replace function hm_create_household(p_token text, p_name text, p_settings jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc uuid := hm_account_for(p_token);
  v_id uuid;
  v_code text;
begin
  if v_acc is null then raise exception 'Please sign in again'; end if;
  loop
    v_code := upper(substr(translate(md5(gen_random_uuid()::text), '01', ''), 1, 6));
    exit when length(v_code) = 6 and not exists (select 1 from hm_households where invite_code = v_code);
  end loop;
  insert into hm_households (name, invite_code, settings) values (p_name, v_code, p_settings) returning id into v_id;
  insert into hm_household_members (household_id, account_id) values (v_id, v_acc);
  return v_id;
end;
$$;

create or replace function hm_join_household(p_token text, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc uuid := hm_account_for(p_token);
  v_id uuid;
begin
  if v_acc is null then raise exception 'Please sign in again'; end if;
  select id into v_id from hm_households where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'No family found with that code'; end if;
  insert into hm_household_members (household_id, account_id) values (v_id, v_acc) on conflict do nothing;
  return v_id;
end;
$$;

create or replace function hm_save_household(p_token text, p_name text, p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid := hm_household_for(p_token);
begin
  if v_hid is null then raise exception 'Please sign in again'; end if;
  update hm_households set name = p_name, settings = p_settings where id = v_hid;
end;
$$;

-- ---------- data ----------

-- Everything the app needs in one call. Returns null when signed in but not
-- in a household yet. Raises when the token is not valid.
create or replace function hm_load(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hid uuid;
begin
  if hm_account_for(p_token) is null then raise exception 'Please sign in again'; end if;
  v_hid := hm_household_for(p_token);
  if v_hid is null then return null; end if;
  return jsonb_build_object(
    'household', (select to_jsonb(h) from hm_households h where h.id = v_hid),
    'items', coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from hm_items t where t.household_id = v_hid), '[]'::jsonb),
    'dishes', coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from hm_dishes t where t.household_id = v_hid), '[]'::jsonb),
    'meals', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from hm_meals t where t.household_id = v_hid), '[]'::jsonb),
    'shopping', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from hm_shopping t where t.household_id = v_hid), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from hm_pantry_events t
                        where t.household_id = v_hid and t.created_at > now() - interval '60 days'), '[]'::jsonb)
  );
end;
$$;

-- Insert or update rows (snake_case keys) in one of the household tables.
create or replace function hm_upsert(p_token text, p_table text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid := hm_household_for(p_token);
  v_cols text;
  v_set text;
begin
  if v_hid is null then raise exception 'Please sign in again'; end if;
  if p_table not in ('hm_items', 'hm_dishes', 'hm_meals', 'hm_shopping', 'hm_pantry_events') then
    raise exception 'Unknown table %', p_table;
  end if;
  if coalesce(jsonb_array_length(p_rows), 0) = 0 then return; end if;
  select string_agg(quote_ident(column_name), ', '),
         string_agg(format('%1$I = excluded.%1$I', column_name), ', ') filter (where column_name not in ('id', 'household_id'))
    into v_cols, v_set
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table
    -- only the columns the client sent, so the others keep their defaults
    and (column_name = 'household_id' or (p_rows -> 0) ? column_name);

  execute format(
    'insert into %1$I (%2$s)
       select %2$s from jsonb_populate_recordset(null::%1$I,
         (select jsonb_agg(r || jsonb_build_object(''household_id'', $1)) from jsonb_array_elements($2) r))
     on conflict (id) do update set %3$s where %1$I.household_id = $1',
    p_table, v_cols, v_set
  ) using v_hid, p_rows;
end;
$$;

create or replace function hm_delete(p_token text, p_table text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid := hm_household_for(p_token);
begin
  if v_hid is null then raise exception 'Please sign in again'; end if;
  if p_table not in ('hm_items', 'hm_dishes', 'hm_meals', 'hm_shopping', 'hm_pantry_events') then
    raise exception 'Unknown table %', p_table;
  end if;
  execute format('delete from %I where household_id = $1 and id = any($2)', p_table) using v_hid, p_ids;
end;
$$;

-- Cheap change check for polling: latest write time in the household.
create or replace function hm_version(p_token text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with h as (select hm_household_for(p_token) as id)
  select concat_ws('|',
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_items, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_dishes, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(created_at)::text, '') from hm_meals, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(coalesce(bought_at, created_at))::text, '') from hm_shopping, h where household_id = h.id),
    (select settings::text from hm_households, h where hm_households.id = h.id));
$$;

-- Keep updated_at honest so hm_version sees edits.
create or replace function hm_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger hm_items_touch before update on hm_items for each row execute function hm_touch();
create or replace trigger hm_dishes_touch before update on hm_dishes for each row execute function hm_touch();

-- Only the API functions are callable; the helpers are internal.
revoke all on function hm_account_for(text) from public, anon, authenticated;
revoke all on function hm_household_for(text) from public, anon, authenticated;
grant execute on function hm_login(text, text) to anon, authenticated;
grant execute on function hm_logout(text) to anon, authenticated;
grant execute on function hm_whoami(text) to anon, authenticated;
grant execute on function hm_create_household(text, text, jsonb) to anon, authenticated;
grant execute on function hm_join_household(text, text) to anon, authenticated;
grant execute on function hm_save_household(text, text, jsonb) to anon, authenticated;
grant execute on function hm_load(text) to anon, authenticated;
grant execute on function hm_upsert(text, text, jsonb) to anon, authenticated;
grant execute on function hm_delete(text, text, uuid[]) to anon, authenticated;
grant execute on function hm_version(text) to anon, authenticated;
