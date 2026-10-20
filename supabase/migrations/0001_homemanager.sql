-- HomeManager schema.
--
-- For now this lives in the Samarth Supabase project, so every object is
-- prefixed hm_ and nothing here reads or changes Samarth's tables. To move
-- HomeManager to its own project later, run this file there and copy the
-- hm_ tables across.
--
-- Access: family members sign in with Supabase Auth (email). Each row
-- belongs to a household, and Row Level Security only lets members of that
-- household see or change it.

create table if not exists hm_households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists hm_members (
  household_id uuid not null references hm_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists hm_members_user_idx on hm_members(user_id);

create table if not exists hm_items (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  name text not null,
  category text not null,
  pack_label text not null default '',
  bucket text not null default 'weekly' check (bucket in ('quick', 'weekly')),
  essential boolean not null default false,
  shelf_life_days integer,
  daily_use real not null default 0,
  level real not null default 0,
  level_at timestamptz not null default now(),
  confirmed_at timestamptz,
  purchased_at timestamptz,
  asked_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists hm_items_household_idx on hm_items(household_id);

create table if not exists hm_dishes (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  name text not null,
  slots text[] not null default '{}',
  tags text[] not null default '{}',
  cook_minutes integer not null default 30,
  ingredients jsonb not null default '[]'::jsonb, -- [{itemId, use, optional?}]
  active boolean not null default true,
  favorite boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists hm_dishes_household_idx on hm_dishes(household_id);

create table if not exists hm_meals (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  date date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'dinner')),
  kind text not null check (kind in ('cooked', 'out', 'leftovers', 'skipped')),
  dish_id uuid references hm_dishes(id) on delete set null,
  label text not null default '',
  servings integer not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists hm_meals_household_date_idx on hm_meals(household_id, date);

create table if not exists hm_shopping (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  item_id uuid references hm_items(id) on delete set null,
  name text not null,
  note text not null default '',
  bucket text not null default 'weekly' check (bucket in ('quick', 'weekly')),
  status text not null default 'needed' check (status in ('needed', 'bought')),
  source text not null default 'manual' check (source in ('auto', 'manual')),
  created_at timestamptz not null default now(),
  bought_at timestamptz
);
create index if not exists hm_shopping_household_idx on hm_shopping(household_id);

create table if not exists hm_pantry_events (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  item_id uuid not null references hm_items(id) on delete cascade,
  reason text not null,
  before real not null,
  after real not null,
  meal_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists hm_pantry_events_household_idx on hm_pantry_events(household_id, created_at);

-- Membership check used by every policy. security definer so it can read
-- hm_members without tripping that table's own policy.
create or replace function hm_is_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from hm_members where household_id = p_household and user_id = auth.uid()
  );
$$;

-- Creates a household and makes the caller its first member. Returns its id.
create or replace function hm_create_household(p_name text, p_settings jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  loop
    v_code := upper(substr(translate(md5(gen_random_uuid()::text), '01', ''), 1, 6));
    exit when length(v_code) = 6 and not exists (select 1 from hm_households where invite_code = v_code);
  end loop;
  insert into hm_households (name, invite_code, settings) values (p_name, v_code, p_settings) returning id into v_id;
  insert into hm_members (household_id, user_id) values (v_id, auth.uid());
  return v_id;
end;
$$;

-- Joins the household with this invite code. Returns its id.
create or replace function hm_join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select id into v_id from hm_households where invite_code = upper(trim(p_code));
  if v_id is null then
    raise exception 'No family found with that code';
  end if;
  insert into hm_members (household_id, user_id) values (v_id, auth.uid()) on conflict do nothing;
  return v_id;
end;
$$;

revoke all on function hm_create_household(text, jsonb) from anon;
revoke all on function hm_join_household(text) from anon;

alter table hm_households enable row level security;
alter table hm_members enable row level security;
alter table hm_items enable row level security;
alter table hm_dishes enable row level security;
alter table hm_meals enable row level security;
alter table hm_shopping enable row level security;
alter table hm_pantry_events enable row level security;

drop policy if exists hm_households_member on hm_households;
create policy hm_households_member on hm_households
  for select to authenticated using (hm_is_member(id));
drop policy if exists hm_households_update on hm_households;
create policy hm_households_update on hm_households
  for update to authenticated using (hm_is_member(id)) with check (hm_is_member(id));

drop policy if exists hm_members_self on hm_members;
create policy hm_members_self on hm_members
  for select to authenticated using (hm_is_member(household_id));

do $$
declare t text;
begin
  foreach t in array array['hm_items', 'hm_dishes', 'hm_meals', 'hm_shopping', 'hm_pantry_events'] loop
    execute format('drop policy if exists %I on %I', t || '_member', t);
    execute format(
      'create policy %I on %I for all to authenticated using (hm_is_member(household_id)) with check (hm_is_member(household_id))',
      t || '_member', t
    );
  end loop;
end $$;

-- Live updates between family members' phones.
do $$
declare t text;
begin
  foreach t in array array['hm_items', 'hm_dishes', 'hm_meals', 'hm_shopping'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
