-- Each feedback item remembers the Claude session that worked on it, so the app can link to it.

alter table hm_feedback add column if not exists session_url text;

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
        'createdAt', f.created_at, 'updatedAt', f.updated_at, 'by', a.username, 'sessionUrl', f.session_url
      ) order by f.created_at desc)
      from (select * from hm_feedback where household_id = hm_household_for(p_token) order by created_at desc limit 100) f
      left join hm_accounts a on a.id = f.account_id
    ), '[]'::jsonb),
    'lastRun', (select value from hm_config where key = 'feedback_last_run')
  );
end;
$$;

-- Called by the Worker right after it starts Claude: links the waiting items to that session.
create or replace function hm_feedback_attach_session(p_token text, p_url text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not hm_feedback_access(p_token) then
    raise exception 'Feedback is not available for this home';
  end if;
  if p_url is null or p_url !~ '^https://claude\.ai/' then return 0; end if;
  update hm_feedback set session_url = p_url
   where household_id = hm_household_for(p_token) and status = 'new' and session_url is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
grant execute on function hm_feedback_attach_session(text, text) to anon, authenticated;
