-- Seller withdrawal requests: reserve the seller's full available balance atomically.
create table if not exists public.seller_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete restrict,
  amount_scr numeric(12,2) not null check (amount_scr > 0),
  status text not null default 'pending' check (status in ('pending','processing','paid','rejected')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  admin_note text
);
alter table public.seller_withdrawal_requests enable row level security;
drop policy if exists "Sellers can view own withdrawal requests" on public.seller_withdrawal_requests;
create policy "Sellers can view own withdrawal requests"
on public.seller_withdrawal_requests for select to authenticated
using (seller_id = auth.uid());

create unique index if not exists one_open_withdrawal_per_seller
on public.seller_withdrawal_requests(seller_id)
where status in ('pending','processing');

create or replace function public.seller_request_withdrawal()
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  current_seller uuid := auth.uid();
  available_amount numeric(12,2);
  new_request uuid;
begin
  if current_seller is null then raise exception 'Please sign in first'; end if;

  -- Serialize requests for this seller to prevent duplicate withdrawals.
  perform 1 from public.profiles where id=current_seller for update;
  if not found then raise exception 'Seller profile not found'; end if;
  if not exists (select 1 from public.profiles where id=current_seller and role='seller') then
    raise exception 'Only seller accounts can request withdrawals';
  end if;
  if exists (select 1 from public.seller_withdrawal_requests where seller_id=current_seller and status in ('pending','processing')) then
    raise exception 'You already have a withdrawal request being processed';
  end if;

  select coalesce(sum(amount_scr),0) into available_amount
  from public.seller_earnings
  where seller_id=current_seller and status='available';
  if available_amount <= 0 then raise exception 'There is no available balance to withdraw'; end if;

  insert into public.seller_withdrawal_requests(seller_id,amount_scr,status)
  values(current_seller,available_amount,'pending')
  returning id into new_request;

  update public.seller_earnings
  set status='withdrawal_pending'
  where seller_id=current_seller and status='available';

  return new_request;
end;
$$;
revoke all on function public.seller_request_withdrawal() from public;
grant execute on function public.seller_request_withdrawal() to authenticated;
