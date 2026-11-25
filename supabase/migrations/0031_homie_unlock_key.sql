-- iPhone Shortcut that unlocks Homie in Claude: a separate random key (only its sha256 is stored).
-- The key can only unlock (20 minutes); it reads nothing.

alter table hm_homie_settings add column if not exists unlock_key_hash text;

-- From the app: make a new unlock key (the old one stops working). Returns the key once.
create or replace function hm_homie_unlock_key_make(p_token text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_acc uuid := hm_private.homie_acc(p_token);
  v_key text := encode(gen_random_bytes(24), 'hex');
begin
  if exists (select 1 from hm_homie_settings where account_id = v_acc and siri_token = p_token) then raise exception 'not allowed'; end if;
  insert into hm_homie_settings (account_id) values (v_acc) on conflict (account_id) do nothing;
  update hm_homie_settings set unlock_key_hash = encode(digest(v_key, 'sha256'), 'hex'), updated_at = now() where account_id = v_acc;
  return v_key;
end $$;

create or replace function hm_homie_unlock_with_key(p_key text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_acc uuid;
begin
  if coalesce(p_key, '') !~ '^[0-9a-f]{48}$' then return jsonb_build_object('ok', false); end if;
  select account_id into v_acc from hm_homie_settings where unlock_key_hash = encode(digest(p_key, 'sha256'), 'hex');
  if v_acc is null then return jsonb_build_object('ok', false); end if;
  update hm_homie_settings set unlocked_until = now() + interval '20 minutes' where account_id = v_acc and pin_hash is not null;
  return jsonb_build_object('ok', true, 'pin', (select pin_hash is not null from hm_homie_settings where account_id = v_acc));
end $$;
