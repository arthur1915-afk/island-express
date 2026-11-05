-- Island Express administrator access setup (no authenticator app required).
-- Run once in Supabase SQL Editor after deploying the updated application.
-- Admin access is still restricted to profiles.is_admin = true.

create or replace function public.admin_list_accounts()
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true) then
    raise exception 'Administrator access required';
  end if;
  return query
  select u.id, u.email::text
  from auth.users u join public.profiles p on p.id = u.id
  where p.is_admin = true order by lower(u.email);
end;
$$;

create or replace function public.admin_set_account_access(target_email text, make_admin boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare target_id uuid; admin_count integer;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true) then
    raise exception 'Administrator access required';
  end if;
  if target_email is null or length(trim(target_email)) = 0 then raise exception 'Enter a valid account email'; end if;
  select u.id into target_id from auth.users u where lower(u.email) = lower(trim(target_email)) limit 1;
  if target_id is null then raise exception 'No registered Island Express account was found with that email'; end if;
  if make_admin then
    update public.profiles set is_admin = true where id = target_id;
  else
    if target_id = auth.uid() then raise exception 'You cannot remove your own administrator access'; end if;
    select count(*) into admin_count from public.profiles where is_admin = true;
    if admin_count <= 1 then raise exception 'The last administrator cannot be removed'; end if;
    update public.profiles set is_admin = false where id = target_id;
  end if;
end;
$$;
revoke all on function public.admin_list_accounts() from public;
revoke all on function public.admin_set_account_access(text, boolean) from public;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_set_account_access(text, boolean) to authenticated;

drop policy if exists "Admins can view all products" on public.products;
drop policy if exists "Admins can update product moderation status" on public.products;
create policy "Admins can view all products" on public.products for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "Admins can update product moderation status" on public.products for update to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true))
with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

drop policy if exists "Admins can view moderation records" on public.product_moderation;
drop policy if exists "Admins can create moderation records" on public.product_moderation;
create policy "Admins can view moderation records" on public.product_moderation for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
create policy "Admins can create moderation records" on public.product_moderation for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

-- Customer Care admin policies no longer require AAL2.
create or replace function public.is_support_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Replace the previous MFA-gated withdrawal read policy.
drop policy if exists "AAL2 admins can view withdrawal requests" on public.seller_withdrawal_requests;
drop policy if exists "Admins can view withdrawal requests" on public.seller_withdrawal_requests;
create policy "Admins can view withdrawal requests" on public.seller_withdrawal_requests for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

create or replace function public.admin_process_withdrawal(target_request_id uuid, decision text, note text default null)
returns void language plpgsql security definer set search_path=public
as $$
declare req public.seller_withdrawal_requests%rowtype;
begin
  if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true) then
    raise exception 'Administrator access required';
  end if;
  select * into req from public.seller_withdrawal_requests where id=target_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if req.status not in ('pending','processing') then raise exception 'This withdrawal request has already been processed'; end if;
  if decision='paid' then
    update public.seller_withdrawal_requests set status='paid',processed_at=now(),admin_note=nullif(trim(note),'') where id=target_request_id;
    update public.seller_earnings set status='paid' where seller_id=req.seller_id and status='withdrawal_pending';
  elsif decision='rejected' then
    update public.seller_withdrawal_requests set status='rejected',processed_at=now(),admin_note=nullif(trim(note),'') where id=target_request_id;
    update public.seller_earnings set status='available' where seller_id=req.seller_id and status='withdrawal_pending';
  else
    raise exception 'Decision must be paid or rejected';
  end if;
end;
$$;
revoke all on function public.admin_process_withdrawal(uuid,text,text) from public;
grant execute on function public.admin_process_withdrawal(uuid,text,text) to authenticated;
