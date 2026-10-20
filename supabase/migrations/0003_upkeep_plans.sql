-- Home upkeep tasks and plans/trips. Applied 2026-10-20 as
-- homemanager_0005_upkeep_plans.

create table if not exists hm_upkeep (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  name text not null,
  category text not null default 'home',
  kind text not null default 'recurring' check (kind in ('recurring', 'renewal')),
  interval_days integer,
  last_done date,
  due_date date,
  remind_days integer not null default 7,
  details jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  notes text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists hm_upkeep_household_idx on hm_upkeep(household_id);
alter table hm_upkeep enable row level security;

create table if not exists hm_plans (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  title text not null,
  kind text not null default 'trip' check (kind in ('trip', 'event', 'other')),
  destination text not null default '',
  international boolean not null default false,
  start_date date not null,
  end_date date not null,
  checklist jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hm_plans_household_idx on hm_plans(household_id);
alter table hm_plans enable row level security;

create or replace trigger hm_upkeep_touch before update on hm_upkeep for each row execute function hm_touch();
create or replace trigger hm_plans_touch before update on hm_plans for each row execute function hm_touch();

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
                        where t.household_id = v_hid and t.created_at > now() - interval '60 days'), '[]'::jsonb),
    'upkeep', coalesce((select jsonb_agg(to_jsonb(t) order by t.name) from hm_upkeep t where t.household_id = v_hid), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(t) order by t.start_date) from hm_plans t where t.household_id = v_hid), '[]'::jsonb)
  );
end;
$$;

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
  if p_table not in ('hm_items', 'hm_dishes', 'hm_meals', 'hm_shopping', 'hm_pantry_events', 'hm_upkeep', 'hm_plans') then
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
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_upkeep, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_plans, h where household_id = h.id),
    (select settings::text from hm_households, h where hm_households.id = h.id));
$$;
