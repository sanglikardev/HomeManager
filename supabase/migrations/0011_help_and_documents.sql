-- Household help (leave-only attendance, salary) and documents & warranties.

create table if not exists hm_staff (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  name text not null,
  role text not null default '',
  monthly_salary numeric(12, 2) not null default 0,
  paid_leaves numeric(4, 1) not null default 0,  -- leave days a month that are not deducted
  weekly_off jsonb not null default '[]',        -- weekdays off, 0 = Sunday
  phone text not null default '',
  notes text not null default '',
  active boolean not null default true,
  start_date date,
  leaves jsonb not null default '{}',            -- { "YYYY-MM-DD": "full" | "half" }
  advances jsonb not null default '[]',          -- [{ id, date, amount, note, settledMonth }]
  payments jsonb not null default '[]',          -- [{ month, amount, date, expenseId }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table hm_staff enable row level security;
create trigger hm_staff_touch before update on hm_staff for each row execute function hm_touch();

create table if not exists hm_docs (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  title text not null,
  category text not null default 'other',
  number text not null default '',
  expiry_date date,
  remind_days integer not null default 30,
  notes text not null default '',
  files jsonb not null default '[]',             -- [{ id, name, mime, size }]; content in hm_doc_files
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table hm_docs enable row level security;
create trigger hm_docs_touch before update on hm_docs for each row execute function hm_touch();

-- File contents (base64), fetched one at a time with hm_doc_file, never in hm_load.
create table if not exists hm_doc_files (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  doc_id uuid not null references hm_docs(id) on delete cascade,
  name text not null default '',
  mime text not null default '',
  data text not null,
  created_at timestamptz not null default now()
);
alter table hm_doc_files enable row level security;
create index if not exists hm_doc_files_doc_idx on hm_doc_files (doc_id);

insert into hm_data_tables (name) values ('hm_staff'), ('hm_docs'), ('hm_doc_files') on conflict do nothing;

create or replace function hm_doc_file(p_token text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('name', f.name, 'mime', f.mime, 'data', f.data)
  from hm_doc_files f
  where f.id = p_id and f.household_id = hm_household_for(p_token);
$$;
grant execute on function hm_doc_file(text, uuid) to anon, authenticated;

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
    'plans', coalesce((select jsonb_agg(to_jsonb(t) order by t.start_date) from hm_plans t where t.household_id = v_hid), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(t) order by t.date, t.created_at) from hm_expenses t
                          where t.household_id = v_hid and t.date > current_date - 400), '[]'::jsonb),
    'bills', coalesce((select jsonb_agg(to_jsonb(t) order by t.next_due) from hm_bills t where t.household_id = v_hid), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from hm_staff t where t.household_id = v_hid), '[]'::jsonb),
    'docs', coalesce((select jsonb_agg(to_jsonb(t) order by t.title) from hm_docs t where t.household_id = v_hid), '[]'::jsonb)
  );
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
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_expenses, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_bills, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_staff, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_docs, h where household_id = h.id),
    (select settings::text from hm_households, h where hm_households.id = h.id));
$$;
