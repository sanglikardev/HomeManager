-- Bank SMS -> expense. An iPhone Shortcuts automation posts each bank SMS to /api/sms?k=KEY.
-- The Worker reads the amount from the text and calls hm_sms_expense. Only the sha256 of the key is stored.

create table if not exists hm_sms_keys (
  key_hash text primary key,
  household_id uuid not null references hm_households(id) on delete cascade,
  account_id uuid not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table hm_sms_keys enable row level security;

-- SMS already added (so a repeated message never makes a second expense).
create table if not exists hm_sms_seen (
  household_id uuid not null references hm_households(id) on delete cascade,
  hash text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, hash)
);
alter table hm_sms_seen enable row level security;

create or replace function hm_sms_key(p_token text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hid uuid := hm_household_for(p_token);
  v_acc uuid := hm_account_for(p_token);
  v_key text := encode(gen_random_bytes(18), 'hex');
begin
  if v_hid is null or v_acc is null then raise exception 'Please sign in again'; end if;
  update hm_sms_keys set active = false where account_id = v_acc;
  insert into hm_sms_keys (key_hash, household_id, account_id) values (encode(digest(v_key, 'sha256'), 'hex'), v_hid, v_acc);
  return v_key;
end;
$$;
grant execute on function hm_sms_key(text) to anon, authenticated;

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
  values (gen_random_uuid(), v_hid, coalesce(p_date, (now() at time zone 'Asia/Kolkata')::date), p_amount, 'other', left(coalesce(p_note, ''), 120), '', 'manual');
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function hm_sms_expense(text, numeric, date, text, text) to anon, authenticated;
