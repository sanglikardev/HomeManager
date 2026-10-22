-- To-do module: simple tasks with an optional due date.

create table if not exists hm_todos (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  done_on date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table hm_todos enable row level security;
create index if not exists hm_todos_household_due_idx on hm_todos (household_id, due_date);
create trigger hm_todos_touch before update on hm_todos for each row execute function hm_touch();

insert into hm_data_tables (name) values ('hm_todos') on conflict do nothing;

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
    'docs', coalesce((select jsonb_agg(to_jsonb(t) order by t.title) from hm_docs t where t.household_id = v_hid), '[]'::jsonb),
    'todos', coalesce((select jsonb_agg(to_jsonb(t) order by t.due_date nulls last, t.created_at) from hm_todos t
                       where t.household_id = v_hid and (not t.done or t.done_on > current_date - 30)), '[]'::jsonb)
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
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_todos, h where household_id = h.id),
    (select settings::text from hm_households, h where hm_households.id = h.id));
$$;
