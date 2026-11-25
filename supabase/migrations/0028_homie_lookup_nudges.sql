-- Homie round 2: lookups for the Claude connector (plans, to-dos, upkeep, bills, documents,
-- habit history, own expenses) and nudges (leave now, streak saver, bedtime).

alter table hm_homie_settings add column if not exists leave_sent date;
alter table hm_homie_settings add column if not exists saver_sent date;
alter table hm_homie_settings add column if not exists bed_sent date;

create or replace function hm_private.homie_min(p_time text, p_default text)
returns int language sql immutable as $$
  select split_part(coalesce(nullif(p_time, ''), p_default), ':', 1)::int * 60 + split_part(coalesce(nullif(p_time, ''), p_default), ':', 2)::int;
$$;

-- One read for the assistant. p_from / p_to bound dated things; p_search filters by name.
create or replace function hm_homie_lookup(p_token text, p_what text, p_from date, p_to date, p_search text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_hid uuid := (select household_id from hm_household_members where account_id = v_acc order by joined_at limit 1);
  v_today date := ((now() at time zone 'utc') + make_interval(mins => hm_private.homie_tz(v_acc)))::date;
  v_q text := '%' || coalesce(nullif(trim(p_search), ''), '') || '%';
begin
  if v_hid is null then return '[]'::jsonb; end if;
  if p_what = 'plans' then
    return (select coalesce(jsonb_agg(to_jsonb(p) - 'household_id' - 'updated_at' order by p.start_date), '[]'::jsonb) from (
      select * from hm_plans where household_id = v_hid and title ilike v_q
        and end_date >= coalesce(p_from, v_today - 30) and start_date <= coalesce(p_to, v_today + 730)
      order by start_date limit 60) p);
  elsif p_what = 'todos' then
    return (select coalesce(jsonb_agg(to_jsonb(t) - 'household_id' - 'updated_at' order by t.done, t.due_date nulls last), '[]'::jsonb) from (
      select * from hm_todos where household_id = v_hid and title ilike v_q
        and (not done or done_on >= coalesce(p_from, v_today - 14))
      order by done, due_date nulls last limit 100) t);
  elsif p_what = 'upkeep' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name, 'category', u.category, 'kind', u.kind,
        'everyDays', u.interval_days, 'lastDone', u.last_done, 'dueDate', u.due_date, 'notes', u.notes) order by u.name), '[]'::jsonb)
      from hm_upkeep u where u.household_id = v_hid and u.name ilike v_q);
  elsif p_what = 'bills' then
    return (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'category', b.category, 'amount', b.amount,
        'frequency', b.frequency, 'nextDue', b.next_due, 'lastPaid', b.last_paid, 'active', b.active) order by b.next_due), '[]'::jsonb)
      from hm_bills b where b.household_id = v_hid and b.name ilike v_q);
  elsif p_what = 'documents' then
    -- Titles and expiry only: document numbers stay in the app.
    return (select coalesce(jsonb_agg(jsonb_build_object('title', d.title, 'category', d.category, 'expiry', d.expiry_date) order by d.expiry_date nulls last), '[]'::jsonb)
      from hm_docs d where d.household_id = v_hid and d.title ilike v_q);
  elsif p_what = 'habit_logs' then
    return (select coalesce(jsonb_agg(jsonb_build_object('date', l.date, 'habit', h.name, 'amount', l.amount, 'note', l.note) order by l.date desc, l.created_at desc), '[]'::jsonb)
      from (select * from hm_habit_logs where household_id = v_hid
              and date between coalesce(p_from, v_today - 30) and coalesce(p_to, v_today)
            order by date desc limit 400) l
      join hm_habits h on h.id = l.habit_id
      where h.name ilike v_q or l.note ilike v_q);
  elsif p_what = 'expenses' then
    return (with e as (
        select * from hm_expenses where household_id = v_hid and owner_id = v_acc
          and date between coalesce(p_from, date_trunc('month', v_today)::date) and coalesce(p_to, v_today)
          and (category ilike v_q or note ilike v_q))
      select jsonb_build_object(
        'total', (select coalesce(sum(amount), 0) from e),
        'byCategory', (select coalesce(jsonb_object_agg(category, s), '{}'::jsonb) from (select category, sum(amount) s from e group by category) c),
        'items', (select coalesce(jsonb_agg(jsonb_build_object('date', x.date, 'amount', x.amount, 'category', x.category, 'note', left(x.note, 120)) order by x.date desc), '[]'::jsonb)
                  from (select * from e order by date desc limit 150) x)));
  elsif p_what = 'my_history' then
    return (select coalesce(jsonb_agg(to_jsonb(i) - 'account_id' order by i.created_at desc), '[]'::jsonb) from (
      select * from hm_homie_items where account_id = v_acc and not forgotten and text ilike v_q
      order by created_at desc limit 200) i);
  end if;
  raise exception 'Unknown lookup %', p_what;
end $$;

-- Reminders, briefs and nudges that are due now. Each kind goes out at most once a day.
create or replace function hm_homie_due(p_secret text, p_briefs boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rem jsonb := '[]'::jsonb;
  v_briefs jsonb := '[]'::jsonb;
  r record;
  v_local timestamp;
  v_day date;
  v_min int;
  v_subs jsonb;
  v_office boolean;
  v_nudges boolean;
  t_wake int; t_eve int; t_leave int; t_home int; t_bed int;
  v_kinds text[];
  k text;
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

  if not p_briefs then
    return jsonb_build_object('vapid', (select value from hm_config where key = 'vapid_private_jwk')::jsonb, 'reminders', v_rem, 'briefs', v_briefs);
  end if;

  for r in select * from hm_homie_settings loop
    v_local := (now() at time zone 'utc') + make_interval(mins => coalesce((r.settings ->> 'tzOffsetMin')::int, 330));
    v_day := v_local::date;
    v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
    t_wake := hm_private.homie_min(r.settings ->> 'wake', '06:00');
    t_eve := hm_private.homie_min(r.settings ->> 'evening', '21:30');
    t_leave := hm_private.homie_min(r.settings ->> 'leave', '08:00');
    t_home := hm_private.homie_min(r.settings ->> 'homeBy', '19:30');
    t_bed := ((t_wake - 465) % 1440 + 1440) % 1440; -- 15 minutes before 7.5 hours' sleep
    v_office := coalesce(r.settings -> 'officeDays', '[1,2,3,4,5]'::jsonb) @> to_jsonb(extract(dow from v_local)::int);
    v_nudges := coalesce((r.settings ->> 'nudges')::boolean, true);
    v_kinds := '{}';

    if coalesce((r.settings ->> 'morningBrief')::boolean, true) and v_min between t_wake and t_wake + 120 and (r.morning_sent is null or r.morning_sent < v_day) then
      update hm_homie_settings set morning_sent = v_day where account_id = r.account_id;
      v_kinds := v_kinds || 'morning';
    end if;
    if v_nudges and v_office and v_min between t_leave - 5 and t_leave + 15 and (r.leave_sent is null or r.leave_sent < v_day) then
      update hm_homie_settings set leave_sent = v_day where account_id = r.account_id;
      v_kinds := v_kinds || 'leave';
    end if;
    if v_nudges and v_min between t_home + 60 and t_home + 90 and (r.saver_sent is null or r.saver_sent < v_day) then
      update hm_homie_settings set saver_sent = v_day where account_id = r.account_id;
      v_kinds := v_kinds || 'saver';
    end if;
    if coalesce((r.settings ->> 'eveningBrief')::boolean, true) and v_min between t_eve and t_eve + 90 and (r.evening_sent is null or r.evening_sent < v_day) then
      update hm_homie_settings set evening_sent = v_day where account_id = r.account_id;
      v_kinds := v_kinds || 'evening';
    end if;
    if v_nudges and v_min between t_bed and t_bed + 20 and (r.bed_sent is null or r.bed_sent < v_day) then
      update hm_homie_settings set bed_sent = v_day where account_id = r.account_id;
      v_kinds := v_kinds || 'bed';
    end if;

    if cardinality(v_kinds) > 0 then
      v_subs := (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
                 from hm_push_subs s where s.account_id = r.account_id and s.active);
      foreach k in array v_kinds loop
        v_briefs := v_briefs || jsonb_build_object('account', r.account_id, 'kind', k, 'subs', v_subs, 'context', hm_private.homie_context(r.account_id));
      end loop;
    end if;
  end loop;

  return jsonb_build_object('vapid', (select value from hm_config where key = 'vapid_private_jwk')::jsonb, 'reminders', v_rem, 'briefs', v_briefs);
end $$;

-- Push to your own phones on request (the scout and Claude's notify tool). At most 6 a day per person.
alter table hm_homie_settings add column if not exists notify_day date;
alter table hm_homie_settings add column if not exists notify_count int not null default 0;

create or replace function hm_homie_notify_targets(p_secret text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_day date := ((now() at time zone 'utc') + make_interval(mins => hm_private.homie_tz(v_acc)))::date;
  v_count int;
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  insert into hm_homie_settings (account_id, notify_day, notify_count) values (v_acc, v_day, 0)
  on conflict (account_id) do update set notify_count = case when hm_homie_settings.notify_day = v_day then hm_homie_settings.notify_count else 0 end,
                                         notify_day = v_day;
  select notify_count into v_count from hm_homie_settings where account_id = v_acc;
  if v_count >= 6 then return jsonb_build_object('ok', false, 'reason', 'limit'); end if;
  update hm_homie_settings set notify_count = notify_count + 1 where account_id = v_acc;
  return jsonb_build_object('ok', true,
    'vapid', (select value from hm_config where key = 'vapid_private_jwk')::jsonb,
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb)
             from hm_push_subs s where s.account_id = v_acc and s.active));
end $$;
