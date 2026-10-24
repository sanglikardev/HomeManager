-- SMS expenses keep the message text in the note (shop on the first line), so allow a longer note.
create or replace function hm_sms_expense(p_key text, p_amount numeric, p_date date, p_note text, p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hid uuid;
begin
  select household_id into v_hid from hm_sms_keys
  where key_hash = encode(digest(coalesce(p_key, ''), 'sha256'), 'hex') and active;
  if v_hid is null then return jsonb_build_object('ok', false, 'reason', 'key'); end if;
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then return jsonb_build_object('ok', false, 'reason', 'amount'); end if;
  insert into hm_sms_seen (household_id, hash) values (v_hid, p_hash) on conflict do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  insert into hm_expenses (id, household_id, date, amount, category, note, paid_by, source)
  values (gen_random_uuid(), v_hid, coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date), p_amount, 'other', left(coalesce(p_note, ''), 600), '', 'manual');
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function hm_sms_expense(text, numeric, date, text, text) to anon, authenticated;
