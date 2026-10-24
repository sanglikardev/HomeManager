-- Private expenses. Each expense has an owner (the account that made it). A person sees their own
-- expenses plus those of members who switched on "share my expenses". Loading is filtered here,
-- not in the app. hm_load keeps returning only your own rows under 'expenses', so older app
-- versions keep working; shared rows, people and 'me' come as extra keys.

alter table hm_expenses add column if not exists owner_id uuid;

-- Existing expenses belong to shubham in the Cadenza home; other homes: their first member.
update hm_expenses e set owner_id = (
  select m.account_id from hm_household_members m
  where m.household_id = e.household_id
  order by (m.account_id = 'd56b0f91-82c5-4de7-bc21-bdf1cfb45ca7'::uuid) desc, m.joined_at
  limit 1)
where e.owner_id is null;

create table if not exists hm_expense_sharing (
  account_id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  shared boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table hm_expense_sharing enable row level security;

create or replace function hm_set_expense_sharing(p_token text, p_shared boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc uuid := hm_account_for(p_token);
  v_hid uuid := hm_household_for(p_token);
begin
  if v_acc is null or v_hid is null then raise exception 'Please sign in again'; end if;
  insert into hm_expense_sharing (account_id, household_id, shared) values (v_acc, v_hid, coalesce(p_shared, false))
  on conflict (account_id) do update set shared = excluded.shared, household_id = excluded.household_id, updated_at = now();
end;
$$;
grant execute on function hm_set_expense_sharing(text, boolean) to anon, authenticated;

-- Expense rows written through hm_upsert always belong to the signed-in account, and only the
-- owner can change an existing one.
create or replace function hm_upsert(p_token text, p_table text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hid uuid := hm_household_for(p_token);
  v_acc uuid := hm_account_for(p_token);
  v_cols text;
  v_set text;
  v_extra jsonb;
  v_guard text := '';
begin
  if v_hid is null then raise exception 'Please sign in again'; end if;
  if not exists (select 1 from hm_data_tables where name = p_table) then
    raise exception 'Unknown table %', p_table;
  end if;
  if coalesce(jsonb_array_length(p_rows), 0) = 0 then return; end if;
  v_extra := jsonb_build_object('household_id', v_hid);
  if p_table = 'hm_expenses' then
    v_extra := v_extra || jsonb_build_object('owner_id', v_acc);
    v_guard := format(' and %I.owner_id = $3', p_table);
  end if;
  select string_agg(quote_ident(column_name), ', '),
         string_agg(format('%1$I = excluded.%1$I', column_name), ', ')
           filter (where column_name not in ('id', 'household_id') and not (p_table = 'hm_expenses' and column_name = 'owner_id'))
    into v_cols, v_set
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table
    and (column_name = 'household_id' or (p_rows -> 0) ? column_name or (p_table = 'hm_expenses' and column_name = 'owner_id'));

  execute format(
    'insert into %1$I (%2$s)
       select %2$s from jsonb_populate_recordset(null::%1$I,
         (select jsonb_agg(r || $4) from jsonb_array_elements($2) r))
     on conflict (id) do update set %3$s where %1$I.household_id = $1%5$s',
    p_table, v_cols, v_set, null, v_guard
  ) using v_hid, p_rows, v_acc, v_extra;
end;
$$;

create or replace function hm_load(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hid uuid;
  v_acc uuid := hm_account_for(p_token);
begin
  if v_acc is null then raise exception 'Please sign in again'; end if;
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
                          where t.household_id = v_hid and t.owner_id = v_acc and t.date > current_date - 400), '[]'::jsonb),
    'shared_expenses', coalesce((select jsonb_agg(to_jsonb(t) order by t.date, t.created_at) from hm_expenses t
                          where t.household_id = v_hid and t.owner_id <> v_acc and t.date > current_date - 400
                            and exists (select 1 from hm_expense_sharing s where s.account_id = t.owner_id and s.household_id = v_hid and s.shared)), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', m.account_id, 'name', a.username, 'shared', coalesce(s.shared, false)) order by m.joined_at)
                        from hm_household_members m join hm_accounts a on a.id = m.account_id
                        left join hm_expense_sharing s on s.account_id = m.account_id
                        where m.household_id = v_hid), '[]'::jsonb),
    'me', v_acc,
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
  with h as (select hm_household_for(p_token) as id, hm_account_for(p_token) as acc)
  select concat_ws('|',
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_items, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_dishes, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(created_at)::text, '') from hm_meals, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(coalesce(bought_at, created_at))::text, '') from hm_shopping, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_upkeep, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_plans, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(e.updated_at)::text, '') from hm_expenses e, h where e.household_id = h.id
       and (e.owner_id = h.acc or exists (select 1 from hm_expense_sharing s where s.account_id = e.owner_id and s.shared))),
    (select coalesce(string_agg(s.account_id::text || s.shared::text, ',' order by s.account_id), '') from hm_expense_sharing s, h where s.household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_bills, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_staff, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_docs, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_todos, h where household_id = h.id),
    (select settings::text from hm_households, h where hm_households.id = h.id));
$$;

-- SMS expenses belong to the person whose link sent them.
create or replace function hm_sms_expense(p_key text, p_amount numeric, p_date date, p_note text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hid uuid;
  v_acc uuid;
begin
  select household_id, account_id into v_hid, v_acc from hm_sms_keys
  where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and active;
  if v_hid is null then return jsonb_build_object('ok', false, 'reason', 'key'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('ok', false, 'reason', 'amount'); end if;
  insert into hm_sms_seen (household_id, hash) values (v_hid, p_hash) on conflict do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  insert into hm_expenses (id, household_id, owner_id, date, amount, category, note, paid_by, source)
  values (gen_random_uuid(), v_hid, v_acc, coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date), p_amount, 'other', left(coalesce(p_note, ''), 600), '', 'manual');
  return jsonb_build_object('ok', true);
end;
$$;

alter table hm_expenses alter column owner_id set not null;
