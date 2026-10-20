-- Run by hand in the Supabase SQL editor (statements that remove rows need a
-- person to approve them, so they are kept separate).
-- HomeManager: lets the app remove its own rows (shopping items, undo a meal)
-- (including upkeep tasks and plans) and sign out. Only touches hm_ functions.
create or replace function hm_logout(p_token text)
returns void language sql security definer set search_path = public
as $$ delete from hm_sessions where token = p_token; $$;

create or replace function hm_delete(p_token text, p_table text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_hid uuid := hm_household_for(p_token);
begin
  if v_hid is null then raise exception 'Please sign in again'; end if;
  if p_table not in ('hm_items', 'hm_dishes', 'hm_meals', 'hm_shopping', 'hm_pantry_events', 'hm_upkeep', 'hm_plans') then
    raise exception 'Unknown table %', p_table;
  end if;
  execute format('delete from %I where household_id = $1 and id = any($2)', p_table) using v_hid, p_ids;
end;
$$;

revoke all on function hm_account_for(text) from public, anon, authenticated;
revoke all on function hm_household_for(text) from public, anon, authenticated;
grant execute on function hm_logout(text) to anon, authenticated;
grant execute on function hm_delete(text, text, uuid[]) to anon, authenticated;
