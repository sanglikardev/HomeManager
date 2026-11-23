-- Habits: anything the home wants to do regularly (drink water, read, work out).
-- Shared by the household. A habit is either a tick ("check") or a number per day
-- ("count", e.g. 8 glasses). Logs are one row per tap or entry; the app adds them up per day.
-- Reminders: the hourly push cron sends a nudge at each reminder hour for habits
-- that are due today and not done yet.

create table if not exists hm_habits (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  name text not null,
  emoji text not null default '',
  kind text not null default 'check' check (kind in ('check', 'count')),
  target numeric not null default 1,      -- per day: 1 for a tick, e.g. 8 for glasses of water
  unit text not null default '',          -- glasses, pages, minutes...
  step numeric not null default 1,        -- added by one quick tap
  schedule text not null default 'daily' check (schedule in ('daily', 'days', 'weekly')),
  days jsonb not null default '[]'::jsonb,           -- weekdays (0 = Sunday) when schedule = 'days'
  per_week integer not null default 3,               -- times a week when schedule = 'weekly'
  reminder_hours jsonb not null default '[]'::jsonb, -- local hours (0-23) to send a nudge
  archived boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table hm_habits enable row level security;
create index if not exists hm_habits_household_idx on hm_habits (household_id);
create trigger hm_habits_touch before update on hm_habits for each row execute function hm_touch();

create table if not exists hm_habit_logs (
  id uuid primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  habit_id uuid not null references hm_habits(id) on delete cascade,
  date date not null,
  amount numeric not null default 1,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table hm_habit_logs enable row level security;
create index if not exists hm_habit_logs_household_date_idx on hm_habit_logs (household_id, date);
create index if not exists hm_habit_logs_habit_idx on hm_habit_logs (habit_id, date);
create trigger hm_habit_logs_touch before update on hm_habit_logs for each row execute function hm_touch();

insert into hm_data_tables (name) values ('hm_habits'), ('hm_habit_logs') on conflict do nothing;

-- The last local hour habit reminders were sent for, per phone (so a rerun of the cron sends nothing twice).
alter table hm_push_subs add column if not exists last_habit_hour timestamp;

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
                       where t.household_id = v_hid and (not t.done or t.done_on > current_date - 30)), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from hm_habits t where t.household_id = v_hid), '[]'::jsonb),
    'habit_logs', coalesce((select jsonb_agg(to_jsonb(t) order by t.date, t.created_at) from hm_habit_logs t
                            where t.household_id = v_hid and t.date > current_date - 400), '[]'::jsonb)
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
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_habits, h where household_id = h.id),
    (select count(*) || ':' || coalesce(max(updated_at)::text, '') from hm_habit_logs, h where household_id = h.id),
    (select settings::text from hm_households, h where hm_households.id = h.id));
$$;

-- Habits that want a nudge at this local hour: due today and not done yet.
-- "Drink water (3/8 glasses) · Read". Null when there is nothing to say.
create or replace function hm_push_habits(p_hid uuid, p_local timestamp)
returns text
language sql
stable
set search_path = public
as $$
  with d as (select p_local::date as day, extract(dow from p_local)::int as dow, extract(hour from p_local)::int as hr,
                    (p_local::date - ((extract(isodow from p_local)::int) - 1)) as week_start),
  h as (
    select hb.*,
      coalesce((select sum(l.amount) from hm_habit_logs l where l.habit_id = hb.id and l.date = d.day), 0) as today_amt,
      (select count(*) from (select l.date from hm_habit_logs l where l.habit_id = hb.id and l.date >= d.week_start and l.date <= d.day
                              group by l.date having sum(l.amount) >= hb.target) x) as week_days
    from hm_habits hb, d
    where hb.household_id = p_hid and not hb.archived and hb.reminder_hours @> to_jsonb(d.hr)
  )
  select nullif(string_agg(
    trim(both from h.emoji || ' ' || h.name) ||
      case when h.kind = 'count' and h.today_amt > 0 then ' (' || h.today_amt::float8::text || '/' || h.target::float8::text || coalesce(nullif(' ' || h.unit, ' '), '') || ')' else '' end,
    ' · ' order by h.created_at), '')
  from h, d
  where h.today_amt < h.target
    and (h.schedule = 'daily'
      or (h.schedule = 'days' and h.days @> to_jsonb(d.dow))
      or (h.schedule = 'weekly' and h.week_days < h.per_week));
$$;

-- Morning summaries that are due now (local hour reached, not sent yet today), plus
-- habit reminders for this local hour. Marks them sent.
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
  v_hour timestamp;
  v_body text;
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  for r in select * from hm_push_subs where active loop
    v_local := (now() at time zone 'utc') + make_interval(mins => r.tz_offset_min);
    v_hour := date_trunc('hour', v_local);

    if r.last_habit_hour is null or r.last_habit_hour < v_hour then
      update hm_push_subs set last_habit_hour = v_hour where id = r.id;
      v_body := hm_push_habits(r.household_id, v_local);
      if v_body is not null then
        v_items := v_items || jsonb_build_object('id', r.id, 'endpoint', r.endpoint, 'p256dh', r.p256dh, 'auth', r.auth,
          'title', 'Habit reminder', 'body', v_body, 'url', '/#habits', 'tag', 'homemanager-habits');
      end if;
    end if;

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
