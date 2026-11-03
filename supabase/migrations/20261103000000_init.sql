-- ============================================================================
-- 安心記帳本 資料庫結構（Supabase / PostgreSQL）
--
-- 設計重點
--   1. 所有「家庭資料表」都啟用 Row Level Security（RLS）：
--      登入的使用者只能讀寫「自己所屬家庭」(household_id) 的資料，由資料庫強制執行，
--      不是靠前端隱藏按鈕。沒有登入（anon）完全沒有權限。
--   2. 主鍵是 (household_id, id)：不同家庭的編號互不影響，舊備份檔的編號可原樣匯入；
--      外鍵也含 household_id，所以資料庫層就不可能把 A 家庭的資料掛到 B 家庭底下。
--   3. 債務、還款與「還款連動的支出」只能透過下面的交易函式修改（一個交易內一起完成），
--      不能從資料表直接改，確保債務金額與每月支出永遠一致。
--   4. 這份檔案只會「新增」東西，不含任何刪除既有資料的指令。
-- ============================================================================

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

-- ---------- 小工具 ----------

-- 10 碼邀請碼（大寫 16 進位），來源是資料庫的密碼學亂數
create or replace function app_private.new_invite_code() returns text
language sql volatile
as $$ select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) $$;

-- 是否為真實存在的日期（YYYY-MM-DD，例如 2026-02-31 不合法）
create or replace function app_private.valid_date(s text) returns boolean
language plpgsql immutable
as $$
begin
  if s is null or s !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  perform s::date;
  return true;
exception when others then
  return false;
end $$;

create or replace function app_private.touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 只有交易函式會把這個旗標打開（交易內有效，使用者無法從網路設定它）
create or replace function app_private.rpc_mode() returns boolean
language sql stable
as $$ select coalesce(current_setting('app.rpc', true), '') = '1' $$;

-- ---------- 家庭與成員 ----------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  invite_code text not null unique default app_private.new_invite_code(),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- 一個帳號只屬於一個家庭
);

-- 目前登入者所屬的家庭（SECURITY DEFINER 以避免成員表的 RLS 造成遞迴）
create or replace function app_private.current_household_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.household_id from public.household_members m where m.user_id = (select auth.uid()) limit 1
$$;
revoke all on function app_private.current_household_id() from public;
grant execute on function app_private.current_household_id() to authenticated;

revoke all on function app_private.new_invite_code() from public;
revoke all on function app_private.valid_date(text) from public;
revoke all on function app_private.touch_updated_at() from public;
revoke all on function app_private.rpc_mode() from public;
grant execute on function app_private.new_invite_code() to authenticated;
grant execute on function app_private.valid_date(text) to authenticated;
grant execute on function app_private.touch_updated_at() to authenticated;
grant execute on function app_private.rpc_mode() to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

create policy households_select on public.households
  for select to authenticated using (id = app_private.current_household_id());
create policy household_members_select on public.household_members
  for select to authenticated using (household_id = app_private.current_household_id());
-- 沒有 insert / update / delete 政策：建立、加入、移除一律走下面的函式。

revoke all on public.households, public.household_members from anon, authenticated;
grant select on public.households, public.household_members to authenticated;

-- 邀請碼輸入失敗次數（防止亂猜邀請碼）。只放在 app_private，網路 API 完全碰不到。
create table app_private.join_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failures integer not null default 0,
  locked_until timestamptz
);
revoke all on app_private.join_attempts from public;

-- ---------- 債務與還款 ----------

create table public.debts (
  household_id uuid not null default app_private.current_household_id() references public.households (id) on delete cascade,
  id text not null default gen_random_uuid()::text,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  creditor text check (creditor is null or char_length(creditor) <= 30),
  original_principal integer not null check (original_principal > 0 and original_principal <= 999999999),
  opening_principal integer not null check (opening_principal >= 0 and opening_principal <= 999999999),
  remaining_principal integer not null check (remaining_principal >= 0),
  adjustment integer not null default 0 check (adjustment >= 0),
  monthly_payment integer check (monthly_payment is null or (monthly_payment > 0 and monthly_payment <= 999999999)),
  payment_day integer not null default 1 check (payment_day between 1 and 31),
  start_date text not null check (app_private.valid_date(start_date)),
  annual_rate double precision not null default 0 check (annual_rate >= 0 and annual_rate <= 100),
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'PAID_OFF')),
  paid_off_date text check (paid_off_date is null or app_private.valid_date(paid_off_date)),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);

create table public.debt_payments (
  household_id uuid not null default app_private.current_household_id() references public.households (id) on delete cascade,
  id text not null default gen_random_uuid()::text,
  debt_id text not null,
  date text not null check (app_private.valid_date(date)),
  amount integer not null check (amount > 0 and amount <= 999999999),
  principal integer not null check (principal >= 0),
  interest integer not null default 0 check (interest >= 0),
  fee integer not null default 0 check (fee >= 0),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  check (amount = principal + interest + fee),
  foreign key (household_id, debt_id) references public.debts (household_id, id) on delete restrict
);
create index debt_payments_debt_idx on public.debt_payments (household_id, debt_id, date);

-- ---------- 收入、支出、預算 ----------

create table public.incomes (
  household_id uuid not null default app_private.current_household_id() references public.households (id) on delete cascade,
  id text not null default gen_random_uuid()::text,
  date text not null check (app_private.valid_date(date)),
  category text not null check (char_length(btrim(category)) between 1 and 20),
  amount integer not null check (amount > 0 and amount <= 999999999),
  note text check (note is null or char_length(note) <= 200),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id)
);
create index incomes_date_idx on public.incomes (household_id, date);

create table public.expenses (
  household_id uuid not null default app_private.current_household_id() references public.households (id) on delete cascade,
  id text not null default gen_random_uuid()::text,
  date text not null check (app_private.valid_date(date)),
  category text not null check (char_length(btrim(category)) between 1 and 20),
  amount integer not null check (amount > 0 and amount <= 999999999),
  note text check (note is null or char_length(note) <= 200),
  debt_payment_id text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  unique (household_id, debt_payment_id),
  foreign key (household_id, debt_payment_id) references public.debt_payments (household_id, id) on delete restrict
);
create index expenses_date_idx on public.expenses (household_id, date);

create table public.monthly_budgets (
  household_id uuid not null default app_private.current_household_id() references public.households (id) on delete cascade,
  id text not null default gen_random_uuid()::text,
  year integer not null check (year between 1900 and 2200),
  month integer not null check (month between 1 and 12),
  amount integer not null check (amount > 0 and amount <= 999999999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, id),
  unique (household_id, year, month)
);

create trigger touch_debts before update on public.debts for each row execute function app_private.touch_updated_at();
create trigger touch_debt_payments before update on public.debt_payments for each row execute function app_private.touch_updated_at();
create trigger touch_incomes before update on public.incomes for each row execute function app_private.touch_updated_at();
create trigger touch_expenses before update on public.expenses for each row execute function app_private.touch_updated_at();
create trigger touch_monthly_budgets before update on public.monthly_budgets for each row execute function app_private.touch_updated_at();

-- 債務還款產生的支出（或分類為「債務還款」的支出）只能由交易函式新增、修改、刪除
create or replace function app_private.guard_debt_expense() returns trigger
language plpgsql
as $$
begin
  if not app_private.rpc_mode() then
    if tg_op = 'INSERT' and (new.debt_payment_id is not null or new.category = '債務還款') then
      raise exception 'ANXIN:debt_expense_locked';
    elsif tg_op = 'UPDATE' and (old.debt_payment_id is not null or new.debt_payment_id is not null or new.category = '債務還款') then
      raise exception 'ANXIN:debt_expense_locked';
    elsif tg_op = 'DELETE' and old.debt_payment_id is not null then
      raise exception 'ANXIN:debt_expense_locked';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function app_private.guard_debt_expense() from public;
grant execute on function app_private.guard_debt_expense() to authenticated;
create trigger guard_debt_expense before insert or update or delete on public.expenses
  for each row execute function app_private.guard_debt_expense();

-- ---------- RLS：每張家庭資料表只能存取自己家庭的資料 ----------

alter table public.incomes enable row level security;
alter table public.expenses enable row level security;
alter table public.monthly_budgets enable row level security;
alter table public.debts enable row level security;
alter table public.debt_payments enable row level security;

create policy incomes_household on public.incomes for all to authenticated
  using (household_id = app_private.current_household_id())
  with check (household_id = app_private.current_household_id());
create policy expenses_household on public.expenses for all to authenticated
  using (household_id = app_private.current_household_id())
  with check (household_id = app_private.current_household_id());
create policy monthly_budgets_household on public.monthly_budgets for all to authenticated
  using (household_id = app_private.current_household_id())
  with check (household_id = app_private.current_household_id());

-- 債務與還款：可以讀自己家庭的；寫入只允許在交易函式內（rpc_mode）
create policy debts_select on public.debts for select to authenticated
  using (household_id = app_private.current_household_id());
create policy debts_write on public.debts for all to authenticated
  using (household_id = app_private.current_household_id() and app_private.rpc_mode())
  with check (household_id = app_private.current_household_id() and app_private.rpc_mode());
create policy debt_payments_select on public.debt_payments for select to authenticated
  using (household_id = app_private.current_household_id());
create policy debt_payments_write on public.debt_payments for all to authenticated
  using (household_id = app_private.current_household_id() and app_private.rpc_mode())
  with check (household_id = app_private.current_household_id() and app_private.rpc_mode());

-- 權限：anon（未登入）什麼都不能碰；authenticated 只拿到需要的最小權限
revoke all on public.incomes, public.expenses, public.monthly_budgets, public.debts, public.debt_payments from anon, authenticated;
grant select, insert, update, delete on public.incomes, public.expenses, public.monthly_budgets to authenticated;
grant select, insert, update, delete on public.debts, public.debt_payments to authenticated;

-- ---------- 家庭：建立、加入、邀請碼、成員 ----------
-- 以下函式使用 SECURITY DEFINER，所有權限檢查都寫在函式內，且一律以 auth.uid() 為準。

create or replace function public.create_household(p_name text, p_display_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then raise exception 'ANXIN:not_signed_in'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'ANXIN:already_member';
  end if;
  insert into public.households (name) values (btrim(p_name)) returning id into hid;
  insert into public.household_members (household_id, user_id, role, display_name)
    values (hid, uid, 'owner', btrim(p_display_name));
  return hid;
end $$;

-- 加入家庭。失敗時「不丟例外而是回傳結果」，這樣失敗次數的記錄才會被保留。
create or replace function public.join_household(p_code text, p_display_name text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  hid uuid;
  locked timestamptz;
begin
  if uid is null then raise exception 'ANXIN:not_signed_in'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;

  select locked_until into locked from app_private.join_attempts where user_id = uid;
  if locked is not null and locked > now() then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  select id into hid from public.households where invite_code = code;
  if hid is null then
    insert into app_private.join_attempts as ja (user_id, failures) values (uid, 1)
    on conflict (user_id) do update set
      failures = case when ja.locked_until is not null and ja.locked_until <= now() then 1 else ja.failures + 1 end,
      locked_until = case
        when (case when ja.locked_until is not null and ja.locked_until <= now() then 1 else ja.failures + 1 end) >= 5
        then now() + interval '15 minutes' else null end;
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
    values (hid, uid, 'member', btrim(p_display_name));
  delete from app_private.join_attempts where user_id = uid;
  return jsonb_build_object('ok', true, 'household_id', hid);
end $$;

create or replace function public.regenerate_invite_code() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  newcode text;
begin
  select household_id into hid from public.household_members where user_id = uid and role = 'owner';
  if hid is null then raise exception 'ANXIN:owner_only'; end if;
  update public.households set invite_code = app_private.new_invite_code() where id = hid returning invite_code into newcode;
  return newcode;
end $$;

create or replace function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  select household_id into hid from public.household_members where user_id = uid and role = 'owner';
  if hid is null then raise exception 'ANXIN:owner_only'; end if;
  if p_user = uid then raise exception 'ANXIN:owner_cannot_leave'; end if;
  delete from public.household_members where household_id = hid and user_id = p_user;
  if not found then raise exception 'ANXIN:member_not_found'; end if;
end $$;

create or replace function public.leave_household() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r text;
begin
  select role into r from public.household_members where user_id = uid;
  if r is null then raise exception 'ANXIN:not_member'; end if;
  if r = 'owner' then raise exception 'ANXIN:owner_cannot_leave'; end if;
  delete from public.household_members where user_id = uid;
end $$;

-- ---------- 預算 ----------

create or replace function public.set_budget(p_year integer, p_month integer, p_amount integer) returns void
language plpgsql set search_path = ''
as $$
begin
  insert into public.monthly_budgets (year, month, amount) values (p_year, p_month, p_amount)
  on conflict (household_id, year, month) do update set amount = excluded.amount;
end $$;

-- ---------- 債務與還款（交易函式，以呼叫者身分執行，RLS 照樣生效）----------

-- 依所有還款紀錄重新計算剩餘本金與狀態
create or replace function app_private.sync_debt(p_debt text, p_today text) returns void
language plpgsql set search_path = ''
as $$
declare
  d public.debts;
  paid bigint;
  last_date text;
  remaining integer;
begin
  select * into d from public.debts where id = p_debt;
  if not found then raise exception 'ANXIN:debt_not_found'; end if;
  select coalesce(sum(principal), 0), max(date) into paid, last_date from public.debt_payments where debt_id = p_debt;
  remaining := greatest(0, d.opening_principal - d.adjustment - paid);
  update public.debts set
    remaining_principal = remaining,
    status = case when remaining = 0 then 'PAID_OFF' else 'ACTIVE' end,
    paid_off_date = case when remaining = 0 then coalesce(d.paid_off_date, last_date, p_today) else null end
  where id = p_debt;
end $$;
revoke all on function app_private.sync_debt(text, text) from public;
grant execute on function app_private.sync_debt(text, text) to authenticated;

create or replace function public.create_debt(p jsonb, p_today text) returns text
language plpgsql set search_path = ''
as $$
declare new_id text;
begin
  perform set_config('app.rpc', '1', true);
  insert into public.debts (name, creditor, original_principal, opening_principal, remaining_principal,
                            monthly_payment, payment_day, start_date, annual_rate, note)
  values (p->>'name', p->>'creditor', (p->>'originalPrincipal')::integer, (p->>'openingPrincipal')::integer,
          (p->>'openingPrincipal')::integer, (p->>'monthlyPayment')::integer,
          coalesce((p->>'paymentDay')::integer, 1), p->>'startDate', coalesce((p->>'annualRate')::float8, 0), p->>'note')
  returning id into new_id;
  perform app_private.sync_debt(new_id, p_today);
  return new_id;
end $$;

create or replace function public.update_debt(p_id text, p jsonb, p_today text) returns void
language plpgsql set search_path = ''
as $$
declare
  d public.debts;
  paid bigint;
begin
  perform set_config('app.rpc', '1', true);
  select * into d from public.debts where id = p_id for update;
  if not found then raise exception 'ANXIN:debt_not_found'; end if;
  select coalesce(sum(principal), 0) into paid from public.debt_payments where debt_id = p_id;
  if (p->>'openingPrincipal')::integer - d.adjustment - paid < 0 then raise exception 'ANXIN:principal_too_small'; end if;
  update public.debts set
    name = p->>'name', creditor = p->>'creditor',
    original_principal = (p->>'originalPrincipal')::integer, opening_principal = (p->>'openingPrincipal')::integer,
    monthly_payment = (p->>'monthlyPayment')::integer, payment_day = coalesce((p->>'paymentDay')::integer, 1),
    start_date = p->>'startDate', annual_rate = coalesce((p->>'annualRate')::float8, 0), note = p->>'note'
  where id = p_id;
  perform app_private.sync_debt(p_id, p_today);
end $$;

create or replace function public.delete_debt(p_id text) returns void
language plpgsql set search_path = ''
as $$
begin
  perform set_config('app.rpc', '1', true);
  perform 1 from public.debts where id = p_id for update;
  if not found then raise exception 'ANXIN:debt_not_found'; end if;
  if exists (select 1 from public.debt_payments where debt_id = p_id) then raise exception 'ANXIN:debt_has_payments'; end if;
  delete from public.debts where id = p_id;
end $$;

-- 標記已還清：把剩餘本金記為「已結清」，不會新增支出
create or replace function public.settle_debt(p_id text, p_today text) returns void
language plpgsql set search_path = ''
as $$
declare
  d public.debts;
  paid bigint;
  remaining integer;
begin
  perform set_config('app.rpc', '1', true);
  select * into d from public.debts where id = p_id for update;
  if not found then raise exception 'ANXIN:debt_not_found'; end if;
  if d.status = 'PAID_OFF' then return; end if;
  select coalesce(sum(principal), 0) into paid from public.debt_payments where debt_id = p_id;
  remaining := greatest(0, d.opening_principal - d.adjustment - paid);
  update public.debts set adjustment = adjustment + remaining, paid_off_date = p_today where id = p_id;
  perform app_private.sync_debt(p_id, p_today);
end $$;

-- 記錄還款：同一個交易內建立還款紀錄、對應的支出（一對一），並更新剩餘本金
create or replace function public.record_debt_payment(p_debt text, p jsonb, p_today text) returns text
language plpgsql set search_path = ''
as $$
declare
  d public.debts;
  paid bigint;
  remaining integer;
  pay_id text;
  v_amount integer := (p->>'amount')::integer;
  v_principal integer := (p->>'principal')::integer;
  v_interest integer := coalesce((p->>'interest')::integer, 0);
  v_fee integer := coalesce((p->>'fee')::integer, 0);
begin
  perform set_config('app.rpc', '1', true);
  select * into d from public.debts where id = p_debt for update;
  if not found then raise exception 'ANXIN:debt_not_found'; end if;
  if d.status = 'PAID_OFF' then raise exception 'ANXIN:debt_already_paid'; end if;
  select coalesce(sum(principal), 0) into paid from public.debt_payments where debt_id = p_debt;
  remaining := greatest(0, d.opening_principal - d.adjustment - paid);
  if v_principal > remaining then raise exception 'ANXIN:principal_exceeds_remaining'; end if;

  insert into public.debt_payments (debt_id, date, amount, principal, interest, fee, note)
  values (p_debt, p->>'date', v_amount, v_principal, v_interest, v_fee, p->>'note')
  returning id into pay_id;
  insert into public.expenses (date, category, amount, note, debt_payment_id)
  values (p->>'date', '債務還款', v_amount, d.name, pay_id);
  perform app_private.sync_debt(p_debt, p_today);
  return pay_id;
end $$;

create or replace function public.update_debt_payment(p_id text, p jsonb, p_today text) returns void
language plpgsql set search_path = ''
as $$
declare
  pay public.debt_payments;
  d public.debts;
  others bigint;
  max_principal integer;
  v_amount integer := (p->>'amount')::integer;
  v_principal integer := (p->>'principal')::integer;
  v_interest integer := coalesce((p->>'interest')::integer, 0);
  v_fee integer := coalesce((p->>'fee')::integer, 0);
begin
  perform set_config('app.rpc', '1', true);
  select * into pay from public.debt_payments where id = p_id for update;
  if not found then raise exception 'ANXIN:payment_not_found'; end if;
  select * into d from public.debts where id = pay.debt_id for update;
  select coalesce(sum(principal), 0) into others from public.debt_payments where debt_id = pay.debt_id and id <> p_id;
  max_principal := greatest(0, d.opening_principal - d.adjustment - others);
  if v_principal > max_principal then raise exception 'ANXIN:principal_exceeds_remaining'; end if;

  update public.debt_payments set date = p->>'date', amount = v_amount, principal = v_principal,
    interest = v_interest, fee = v_fee, note = p->>'note' where id = p_id;
  update public.expenses set date = p->>'date', amount = v_amount, category = '債務還款', note = d.name
    where debt_payment_id = p_id;
  if not found then
    insert into public.expenses (date, category, amount, note, debt_payment_id)
    values (p->>'date', '債務還款', v_amount, d.name, p_id);
  end if;
  perform app_private.sync_debt(pay.debt_id, p_today);
end $$;

create or replace function public.delete_debt_payment(p_id text, p_today text) returns void
language plpgsql set search_path = ''
as $$
declare pay public.debt_payments;
begin
  perform set_config('app.rpc', '1', true);
  select * into pay from public.debt_payments where id = p_id for update;
  if not found then raise exception 'ANXIN:payment_not_found'; end if;
  delete from public.expenses where debt_payment_id = p_id;
  delete from public.debt_payments where id = p_id;
  perform app_private.sync_debt(pay.debt_id, p_today);
end $$;

-- ---------- 備份還原：只新增、不覆蓋、不刪除；全部在同一個交易內 ----------

create or replace function public.import_backup_rows(p jsonb, p_today text) returns void
language plpgsql set search_path = ''
as $$
declare rec record;
begin
  perform set_config('app.rpc', '1', true);

  insert into public.debts (id, name, creditor, original_principal, opening_principal, remaining_principal,
                            adjustment, monthly_payment, payment_day, start_date, annual_rate, note, paid_off_date)
  select r.id, r.name, r.creditor, r."originalPrincipal", r."openingPrincipal", r."openingPrincipal",
         coalesce(r.adjustment, 0), r."monthlyPayment", coalesce(r."paymentDay", 1), r."startDate",
         coalesce(r."annualRate", 0), r.note, r."paidOffDate"
  from jsonb_to_recordset(coalesce(p->'debts', '[]'::jsonb)) as r(
    id text, name text, creditor text, "originalPrincipal" integer, "openingPrincipal" integer, adjustment integer,
    "monthlyPayment" integer, "paymentDay" integer, "startDate" text, "annualRate" double precision, note text, "paidOffDate" text);

  insert into public.debt_payments (id, debt_id, date, amount, principal, interest, fee, note)
  select r.id, r."debtId", r.date, r.amount, r.principal, coalesce(r.interest, 0), coalesce(r.fee, 0), r.note
  from jsonb_to_recordset(coalesce(p->'debtPayments', '[]'::jsonb)) as r(
    id text, "debtId" text, date text, amount integer, principal integer, interest integer, fee integer, note text);

  insert into public.incomes (id, date, category, amount, note)
  select r.id, r.date, r.category, r.amount, r.note
  from jsonb_to_recordset(coalesce(p->'incomes', '[]'::jsonb)) as r(id text, date text, category text, amount integer, note text);

  insert into public.expenses (id, date, category, amount, note, debt_payment_id)
  select r.id, r.date, r.category, r.amount, r.note, r."debtPaymentId"
  from jsonb_to_recordset(coalesce(p->'expenses', '[]'::jsonb)) as r(
    id text, date text, category text, amount integer, note text, "debtPaymentId" text);

  insert into public.monthly_budgets (year, month, amount)
  select r.year, r.month, r.amount
  from jsonb_to_recordset(coalesce(p->'budgets', '[]'::jsonb)) as r(year integer, month integer, amount integer);

  for rec in
    select id from jsonb_to_recordset(coalesce(p->'debts', '[]'::jsonb)) as r(id text)
    union
    select "debtId" from jsonb_to_recordset(coalesce(p->'debtPayments', '[]'::jsonb)) as r("debtId" text)
  loop
    perform app_private.sync_debt(rec.id, p_today);
  end loop;
end $$;

-- ---------- 函式的執行權限：未登入不能呼叫，登入者才可以 ----------
-- （Postgres 預設把函式的 EXECUTE 開放給所有人，這裡明確收回再單獨授權）

do $$
declare f text;
begin
  foreach f in array array[
    'create_household(text, text)', 'join_household(text, text)', 'regenerate_invite_code()',
    'remove_member(uuid)', 'leave_household()', 'set_budget(integer, integer, integer)',
    'create_debt(jsonb, text)', 'update_debt(text, jsonb, text)', 'delete_debt(text)', 'settle_debt(text, text)',
    'record_debt_payment(text, jsonb, text)', 'update_debt_payment(text, jsonb, text)',
    'delete_debt_payment(text, text)', 'import_backup_rows(jsonb, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
