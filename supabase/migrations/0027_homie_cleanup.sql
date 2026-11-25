-- Homie cleanup: removes chat older than 30 days and items you told Homie to forget
-- (a week after, so an undo still works). The 5-minute Worker cron calls it.
-- Contains DELETE, so the owner runs it in the Supabase SQL editor.
create or replace function hm_homie_cleanup(p_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not hm_push_secret_ok(p_secret) then raise exception 'not allowed'; end if;
  delete from hm_homie_chat c
  where c.created_at < now() - interval '30 days'
     or c.created_at < coalesce((select s.chat_cleared_at from hm_homie_settings s where s.account_id = c.account_id), '-infinity');
  delete from hm_homie_items where forgotten and updated_at < now() - interval '7 days';
  delete from hm_homie_items where kind = 'reminder' and done and updated_at < now() - interval '30 days';
  delete from hm_homie_items where kind = 'busy' and day < current_date - 30;
end $$;
