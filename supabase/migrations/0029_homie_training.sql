-- Homie training plan: a private workout log per person (never shared with the household).

create table if not exists hm_homie_workouts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references hm_accounts(id),
  date date not null,
  session text not null default '',
  done jsonb not null default '[]'::jsonb,
  complete boolean not null default false,
  knee smallint check (knee between 0 and 10),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, date)
);
alter table hm_homie_workouts enable row level security;

create or replace function hm_private.homie_workouts(p_acc uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', w.date, 'session', w.session, 'done', w.done, 'complete', w.complete,
    'knee', w.knee, 'note', w.note) order by w.date), '[]'::jsonb)
  from (select * from hm_homie_workouts where account_id = p_acc and date between p_from and p_to order by date limit 400) w;
$$;

create or replace function hm_private.homie_context(p_acc uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_local timestamp := (now() at time zone 'utc') + make_interval(mins => hm_private.homie_tz(p_acc));
  v_today date := v_local::date;
  v_hid uuid := (select household_id from hm_household_members where account_id = p_acc order by joined_at limit 1);
begin
  return jsonb_build_object(
    'now', to_char(v_local, 'YYYY-MM-DD"T"HH24:MI'),
    'weekday', trim(to_char(v_local, 'Day')),
    'username', (select username from hm_accounts where id = p_acc),
    'settings', coalesce((select settings from hm_homie_settings where account_id = p_acc), '{}'::jsonb),
    'items', hm_private.homie_items(p_acc),
    'chat', hm_private.homie_chat(p_acc, 20),
    'workouts', hm_private.homie_workouts(p_acc, v_today - 28, v_today),
    'home', case when v_hid is null then null else jsonb_build_object(
      'habits', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', h.id, 'name', h.name, 'kind', h.kind, 'target', h.target, 'unit', h.unit,
          'schedule', h.schedule, 'days', h.days, 'perWeek', h.per_week,
          'today', coalesce((select sum(l.amount) from hm_habit_logs l where l.habit_id = h.id and l.date = v_today), 0),
          'daysDoneLast7', (select count(distinct l.date) from hm_habit_logs l where l.habit_id = h.id and l.date > v_today - 7),
          'lastNote', (select l.note from hm_habit_logs l where l.habit_id = h.id and l.note <> '' order by l.date desc, l.created_at desc limit 1)
        ) order by h.sort_order), '[]'::jsonb)
        from hm_habits h where h.household_id = v_hid and not h.archived),
      'todos', (select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'due', t.due_date) order by t.due_date nulls last), '[]'::jsonb)
        from (select * from hm_todos where household_id = v_hid and not done order by due_date nulls last limit 30) t),
      'billsDue', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'amount', b.amount, 'due', b.next_due) order by b.next_due), '[]'::jsonb)
        from hm_bills b where b.household_id = v_hid and b.active and b.next_due <= v_today + 10),
      'plans', (select coalesce(jsonb_agg(jsonb_build_object('title', p.title, 'kind', p.kind, 'destination', p.destination,
          'start', p.start_date, 'end', p.end_date, 'time', p.time) order by p.start_date), '[]'::jsonb)
        from hm_plans p where p.household_id = v_hid and p.end_date >= v_today and p.start_date <= v_today + 120),
      'shopping', (select coalesce(jsonb_agg(s.name), '[]'::jsonb)
        from (select name from hm_shopping where household_id = v_hid and status = 'needed' order by created_at limit 50) s),
      'myExpensesThisMonth', (select coalesce(sum(amount), 0) from hm_expenses
        where household_id = v_hid and owner_id = p_acc and date >= date_trunc('month', v_today)::date)
    ) end
  );
end $$;

create or replace function hm_homie_load(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_today date := ((now() at time zone 'utc') + make_interval(mins => hm_private.homie_tz(v_acc)))::date;
begin
  return jsonb_build_object(
    'settings', (select settings from hm_homie_settings where account_id = v_acc),
    'hasSiri', coalesce((select siri_token is not null from hm_homie_settings where account_id = v_acc), false),
    'items', hm_private.homie_items(v_acc),
    'chat', hm_private.homie_chat(v_acc, 60),
    'workouts', hm_private.homie_workouts(v_acc, v_today - 56, v_today));
end $$;

-- One day's log for the caller (one row per day; saving again replaces it).
create or replace function hm_homie_workout_save(p_token text, p_workout jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_date date := (p_workout ->> 'date')::date;
begin
  if v_date is null or v_date > current_date + 1 or jsonb_typeof(coalesce(p_workout -> 'done', '[]'::jsonb)) <> 'array' then
    raise exception 'Bad workout';
  end if;
  insert into hm_homie_workouts (account_id, date, session, done, complete, knee, note)
  values (v_acc, v_date, left(coalesce(p_workout ->> 'session', ''), 40), coalesce(p_workout -> 'done', '[]'::jsonb),
          coalesce((p_workout ->> 'complete')::boolean, false), (p_workout ->> 'knee')::smallint, left(coalesce(p_workout ->> 'note', ''), 500))
  on conflict (account_id, date) do update set session = excluded.session, done = excluded.done, complete = excluded.complete,
    knee = excluded.knee, note = excluded.note, updated_at = now();
  return hm_private.homie_workouts(v_acc, v_date, v_date) -> 0;
end $$;

create or replace function hm_homie_workouts(p_token text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_today date := ((now() at time zone 'utc') + make_interval(mins => hm_private.homie_tz(v_acc)))::date;
begin
  return hm_private.homie_workouts(v_acc, coalesce(p_from, v_today - 56), coalesce(p_to, v_today));
end $$;
