-- Only the owner can delete an expense. Contains DELETE, so the owner runs it in the Supabase SQL editor.
create or replace function hm_delete(p_token text, p_table text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_hid uuid := hm_household_for(p_token);
  v_acc uuid := hm_account_for(p_token);
begin
  if v_hid is null then raise exception 'Please sign in again'; end if;
  if not exists (select 1 from hm_data_tables where name = p_table) then
    raise exception 'Unknown table %', p_table;
  end if;
  if p_table = 'hm_expenses' then
    delete from hm_expenses where household_id = v_hid and owner_id = v_acc and id = any(p_ids);
  else
    execute format('delete from %I where household_id = $1 and id = any($2)', p_table) using v_hid, p_ids;
  end if;
end;
$$;
