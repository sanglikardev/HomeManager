-- Homie: a personal assistant per account (not shared with the household).
-- Settings, things it knows (facts, notes, reminders, busy days) and a short chat log.
-- All private to one account. Read and written through token-checked functions;
-- the cron reads due reminders and briefs with the PUSH_SECRET.
-- Hard cleanup (chat older than 30 days, forgotten items) is in 0027, run by hand.

create schema if not exists hm_private;

create table if not exists hm_homie_settings (
  account_id uuid primary key references hm_accounts(id),
  settings jsonb not null default '{}'::jsonb,
  morning_sent date,
  evening_sent date,
  chat_cleared_at timestamptz,
  siri_token text,
  updated_at timestamptz not null default now()
);

create table if not exists hm_homie_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references hm_accounts(id),
  kind text not null check (kind in ('fact', 'note', 'reminder', 'busy')),
  text text not null check (length(text) between 1 and 2000),
  at timestamptz,          -- reminder: when to notify
  day date,                -- busy: which day
  done boolean not null default false,
  sent boolean not null default false,
  forgotten boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists hm_homie_items_account on hm_homie_items (account_id, kind);
create index if not exists hm_homie_items_due on hm_homie_items (at) where kind = 'reminder' and not sent;

create table if not exists hm_homie_chat (
  id bigint generated always as identity primary key,
  account_id uuid not null references hm_accounts(id),
  role text not null check (role in ('user', 'assistant')),
  text text not null check (length(text) <= 8000),
  created_at timestamptz not null default now()
);
create index if not exists hm_homie_chat_account on hm_homie_chat (account_id, created_at);

alter table hm_homie_settings enable row level security;
alter table hm_homie_items enable row level security;
alter table hm_homie_chat enable row level security;

-- ---------- internal helpers (hm_private is not exposed through the API) ----------

create or replace function hm_private.homie_acc(p_token text)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v uuid := hm_account_for(p_token);
begin
  if v is null then raise exception 'Please sign in again'; end if;
  return v;
end $$;

-- Minutes east of UTC for this account (India by default).
create or replace function hm_private.homie_tz(p_acc uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (settings ->> 'tzOffsetMin')::int from hm_homie_settings where account_id = p_acc), 330);
$$;

create or replace function hm_private.homie_items(p_acc uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(i) - 'account_id' order by i.created_at desc), '[]'::jsonb)
  from (
    select * from hm_homie_items
    where account_id = p_acc and not forgotten
      and (kind in ('fact', 'note')
        or (kind = 'reminder' and (not done or updated_at > now() - interval '3 days'))
        or (kind = 'busy' and day >= current_date - 1))
    order by created_at desc
    limit 400
  ) i;
$$;

create or replace function hm_private.homie_chat(p_acc uuid, p_limit int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('role', c.role, 'text', c.text, 'at', c.created_at) order by c.id), '[]'::jsonb)
  from (
    select * from hm_homie_chat
    where account_id = p_acc
      and created_at > now() - interval '30 days'
      and created_at > coalesce((select chat_cleared_at from hm_homie_settings where account_id = p_acc), '-infinity')
    order by id desc
    limit p_limit
  ) c;
$$;

-- What Homie sees on each request: its own notes plus a compact view of the home.
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

-- ---------- app functions (session token) ----------

create or replace function hm_homie_load(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acc uuid := hm_private.homie_acc(p_token);
begin
  return jsonb_build_object(
    'settings', (select settings from hm_homie_settings where account_id = v_acc),
    'hasSiri', coalesce((select siri_token is not null from hm_homie_settings where account_id = v_acc), false),
    'items', hm_private.homie_items(v_acc),
    'chat', hm_private.homie_chat(v_acc, 60));
end $$;

create or replace function hm_homie_context(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select hm_private.homie_context(hm_private.homie_acc(p_token));
$$;

create or replace function hm_homie_save_settings(p_token text, p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc uuid := hm_private.homie_acc(p_token);
begin
  if jsonb_typeof(p_settings) <> 'object' or length(p_settings::text) > 20000 then raise exception 'Bad settings'; end if;
  insert into hm_homie_settings (account_id, settings) values (v_acc, p_settings)
  on conflict (account_id) do update set settings = excluded.settings, updated_at = now();
end $$;

-- Adds an item (no id) or changes one of your own (with id). Returns the saved row.
create or replace function hm_homie_item_save(p_token text, p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_row hm_homie_items;
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
begin
  if v_id is not null and exists (select 1 from hm_homie_items where id = v_id and account_id = v_acc) then
    update hm_homie_items set
      text = coalesce(p_item ->> 'text', text),
      at = case when p_item ? 'at' then (p_item ->> 'at')::timestamptz else at end,
      day = case when p_item ? 'day' then (p_item ->> 'day')::date else day end,
      done = coalesce((p_item ->> 'done')::boolean, done),
      forgotten = coalesce((p_item ->> 'forgotten')::boolean, forgotten),
      sent = case when p_item ? 'at' and (p_item ->> 'at')::timestamptz is distinct from at then false else sent end,
      updated_at = now()
    where id = v_id
    returning * into v_row;
  else
    insert into hm_homie_items (id, account_id, kind, text, at, day, done)
    values (coalesce(v_id, gen_random_uuid()), v_acc, p_item ->> 'kind', p_item ->> 'text',
      (p_item ->> 'at')::timestamptz, (p_item ->> 'day')::date, coalesce((p_item ->> 'done')::boolean, false))
    returning * into v_row;
  end if;
  return to_jsonb(v_row) - 'account_id';
end $$;

create or replace function hm_homie_chat_add(p_token text, p_role text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc uuid := hm_private.homie_acc(p_token);
begin
  insert into hm_homie_chat (account_id, role, text) values (v_acc, p_role, left(p_text, 8000));
end $$;

-- Hides the chat so far (the rows go with the 30-day cleanup).
create or replace function hm_homie_chat_clear(p_token text)
returns void language plpgsql security definer set search_path = public as $$
declare v_acc uuid := hm_private.homie_acc(p_token);
begin
  insert into hm_homie_settings (account_id, chat_cleared_at) values (v_acc, now())
  on conflict (account_id) do update set chat_cleared_at = now(), updated_at = now();
end $$;

-- A long-lived key for the Siri Shortcut: a session of its own. A new key signs the old one out.
create or replace function hm_homie_siri_key(p_token text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_old text := (select siri_token from hm_homie_settings where account_id = v_acc);
  v_new text := encode(gen_random_bytes(24), 'hex');
begin
  if v_old is not null then perform hm_logout(v_old); end if;
  insert into hm_sessions (token, account_id) values (v_new, v_acc);
  insert into hm_homie_settings (account_id, siri_token) values (v_acc, v_new)
  on conflict (account_id) do update set siri_token = v_new, updated_at = now();
  return v_new;
end $$;

-- ---------- cron (PUSH_SECRET) ----------

-- Reminders that are due, and morning/evening briefs whose time has come (each sent once a day).
-- Marks them sent before returning, so a failed send is not repeated every 5 minutes.
create or replace function hm_homie_due(p_secret text, p_briefs boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rem jsonb := '[]'::jsonb;
  v_briefs jsonb := '[]'::jsonb;
  r record;
  v_local timestamp;
  v_min int;
  v_wake int;
  v_eve int;
  v_subs jsonb;
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;

  for r in
    update hm_homie_items set sent = true, updated_at = now()
    where kind = 'reminder' and not sent and not done and not forgotten and at <= now() and at > now() - interval '1 day'
    returning id, account_id, text
  loop
    v_rem := v_rem || jsonb_build_object('id', r.id, 'text', r.text,
      'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
               from hm_push_subs s where s.account_id = r.account_id and s.active));
  end loop;

  if p_briefs then
    for r in select * from hm_homie_settings loop
      v_local := (now() at time zone 'utc') + make_interval(mins => coalesce((r.settings ->> 'tzOffsetMin')::int, 330));
      v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
      v_wake := split_part(coalesce(r.settings ->> 'wake', '06:00'), ':', 1)::int * 60 + split_part(coalesce(r.settings ->> 'wake', '06:00'), ':', 2)::int;
      v_eve := split_part(coalesce(r.settings ->> 'evening', '21:30'), ':', 1)::int * 60 + split_part(coalesce(r.settings ->> 'evening', '21:30'), ':', 2)::int;
      v_subs := (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                 from hm_push_subs s where s.account_id = r.account_id and s.active);
      if coalesce((r.settings ->> 'morningBrief')::boolean, true) and v_min between v_wake and v_wake + 120
         and (r.morning_sent is null or r.morning_sent < v_local::date) then
        update hm_homie_settings set morning_sent = v_local::date where account_id = r.account_id;
        v_briefs := v_briefs || jsonb_build_object('account', r.account_id, 'kind', 'morning', 'subs', v_subs, 'context', hm_private.homie_context(r.account_id));
      elsif coalesce((r.settings ->> 'eveningBrief')::boolean, true) and v_min between v_eve and v_eve + 90
         and (r.evening_sent is null or r.evening_sent < v_local::date) then
        update hm_homie_settings set evening_sent = v_local::date where account_id = r.account_id;
        v_briefs := v_briefs || jsonb_build_object('account', r.account_id, 'kind', 'evening', 'subs', v_subs, 'context', hm_private.homie_context(r.account_id));
      end if;
    end loop;
  end if;

  return jsonb_build_object('vapid', (select value from hm_config where key = 'vapid_private_jwk')::jsonb,
    'reminders', v_rem, 'briefs', v_briefs);
end $$;

-- Saves a brief the Worker wrote into that account's chat.
create or replace function hm_homie_brief_save(p_secret text, p_account uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  insert into hm_homie_chat (account_id, role, text) values (p_account, 'assistant', left(p_text, 8000));
end $$;
