-- 每個家庭最多 2 位成員（這個帳本只給兩個人使用）。
create or replace function app_private.enforce_member_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.households where id = new.household_id for update;
  if (select count(*) from public.household_members where household_id = new.household_id) >= 2 then
    raise exception 'ANXIN:household_full';
  end if;
  return new;
end $$;

drop trigger if exists household_members_limit on public.household_members;
create trigger household_members_limit before insert on public.household_members
  for each row execute function app_private.enforce_member_limit();
