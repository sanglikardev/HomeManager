-- In-app feedback (bugs and ideas) that Claude works through.
-- Only the owner household (the first account's home) can send feedback or ask Claude to run.

create table if not exists hm_config (
  key text primary key,
  value text not null default ''
);
alter table hm_config enable row level security;

insert into hm_config (key, value)
select 'feedback_household', m.household_id::text
from hm_household_members m join hm_accounts a on a.id = m.account_id
order by a.created_at, m.joined_at
limit 1
on conflict (key) do nothing;

create table if not exists hm_feedback (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references hm_households(id) on delete cascade,
  account_id uuid references hm_accounts(id) on delete set null,
  kind text not null default 'bug' check (kind in ('bug', 'idea')),
  body text not null check (length(body) between 1 and 4000),
  status text not null default 'new' check (status in ('new', 'working', 'done', 'question', 'declined')),
  claude_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table hm_feedback enable row level security;
create index if not exists hm_feedback_household_idx on hm_feedback (household_id, created_at desc);

create or replace function hm_feedback_access(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(hm_household_for(p_token)::text = (select value from hm_config where key = 'feedback_household'), false);
$$;

create or replace function hm_feedback_list(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not hm_feedback_access(p_token) then
    return jsonb_build_object('enabled', false, 'items', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'enabled', true,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'body', f.body, 'status', f.status, 'claudeNote', f.claude_note,
        'createdAt', f.created_at, 'updatedAt', f.updated_at, 'by', a.username
      ) order by f.created_at desc)
      from (select * from hm_feedback where household_id = hm_household_for(p_token) order by created_at desc limit 100) f
      left join hm_accounts a on a.id = f.account_id
    ), '[]'::jsonb),
    'lastRun', (select value from hm_config where key = 'feedback_last_run')
  );
end;
$$;

create or replace function hm_feedback_add(p_token text, p_kind text, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not hm_feedback_access(p_token) then
    raise exception 'Feedback is not available for this home';
  end if;
  insert into hm_feedback (household_id, account_id, kind, body)
  values (hm_household_for(p_token), hm_account_for(p_token), case when p_kind = 'idea' then 'idea' else 'bug' end, left(trim(p_body), 4000))
  returning id into v_id;
  return v_id;
end;
$$;

-- Called by the Worker before it starts a Claude run: checks access and spaces runs 10 minutes apart.
create or replace function hm_feedback_request_run(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_open integer;
begin
  if not hm_feedback_access(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  select count(*) into v_open from hm_feedback where household_id = hm_household_for(p_token) and status = 'new';
  if v_open = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_new');
  end if;
  select nullif(value, '')::timestamptz into v_last from hm_config where key = 'feedback_last_run';
  if v_last is not null and v_last > now() - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'too_soon', 'lastRun', v_last);
  end if;
  insert into hm_config (key, value) values ('feedback_last_run', now()::text)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'open', v_open);
end;
$$;

grant execute on function hm_feedback_list(text) to anon, authenticated;
grant execute on function hm_feedback_add(text, text, text) to anon, authenticated;
grant execute on function hm_feedback_request_run(text) to anon, authenticated;

-- ---- 0006: master password for starting a Claude run ----
-- The password hash is set separately in the SQL editor, never committed:
--   insert into hm_config (key, value) values ('feedback_password_hash', extensions.crypt('<password>', extensions.gen_salt('bf')))
--   on conflict (key) do update set value = excluded.value;

create table if not exists hm_feedback_failures (
  at timestamptz not null default now()
);
alter table hm_feedback_failures enable row level security;

-- Starting a run needs the owner home's session AND the master password.
-- 5 wrong tries an hour locks it.
create or replace function hm_feedback_request_run(p_token text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_last timestamptz;
  v_open integer;
  v_hash text;
begin
  if not hm_feedback_access(p_token) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if (select count(*) from hm_feedback_failures where at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;
  select value into v_hash from hm_config where key = 'feedback_password_hash';
  if v_hash is null or v_hash = '' or crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    insert into hm_feedback_failures default values;
    return jsonb_build_object('ok', false, 'reason', 'wrong_password');
  end if;
  select count(*) into v_open from hm_feedback where household_id = hm_household_for(p_token) and status = 'new';
  if v_open = 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_new');
  end if;
  select nullif(value, '')::timestamptz into v_last from hm_config where key = 'feedback_last_run';
  if v_last is not null and v_last > now() - interval '10 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;
  insert into hm_config (key, value) values ('feedback_last_run', now()::text)
  on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('ok', true, 'open', v_open);
end;
$$;
grant execute on function hm_feedback_request_run(text, text) to anon, authenticated;

-- The one-argument version is retired: a run always needs the password.
create or replace function hm_feedback_request_run(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$ select jsonb_build_object('ok', false, 'reason', 'password_required'); $$;
