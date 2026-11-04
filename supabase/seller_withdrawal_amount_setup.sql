-- Allow sellers to request a specific amount, reserving that amount against earnings.
create table if not exists public.seller_withdrawal_allocations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.seller_withdrawal_requests(id) on delete cascade,
  earning_id uuid not null references public.seller_earnings(id) on delete restrict,
  amount_scr numeric(12,2) not null check (amount_scr > 0),
  created_at timestamptz not null default now(),
  unique(request_id,earning_id)
);
alter table public.seller_withdrawal_allocations enable row level security;

drop policy if exists "Sellers can view own withdrawal allocations" on public.seller_withdrawal_allocations;
create policy "Sellers can view own withdrawal allocations"
on public.seller_withdrawal_allocations for select to authenticated
using (
  exists (
    select 1 from public.seller_withdrawal_requests r
    where r.id=request_id and r.seller_id=auth.uid()
  )
);

drop function if exists public.seller_request_withdrawal();
create or replace function public.seller_request_withdrawal(requested_amount numeric)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  current_seller uuid := auth.uid();
  available_amount numeric(12,2);
  remaining_amount numeric(12,2);
  new_request uuid;
  earning record;
  already_allocated numeric(12,2);
  take_amount numeric(12,2);
begin
  if current_seller is null then raise exception 'Please sign in first'; end if;
  if requested_amount is null or requested_amount <= 0 or requested_amount <> round(requested_amount,2) then
    raise exception 'Enter a valid amount with up to two decimal places';
  end if;

  perform 1 from public.profiles where id=current_seller for update;
  if not found or not exists(select 1 from public.profiles where id=current_seller and role='seller') then
    raise exception 'Only seller accounts can request withdrawals';
  end if;
  if exists(select 1 from public.seller_withdrawal_requests where seller_id=current_seller and status in ('pending','processing')) then
    raise exception 'You already have a withdrawal request being processed';
  end if;

  select coalesce(sum(e.amount_scr),0) into available_amount
  from public.seller_earnings e
  where e.seller_id=current_seller and e.status='available';

  select available_amount - coalesce(sum(a.amount_scr),0) into available_amount
  from public.seller_withdrawal_allocations a
  join public.seller_withdrawal_requests r on r.id=a.request_id
  where r.seller_id=current_seller and r.status in ('pending','processing','paid');

  if requested_amount > available_amount then
    raise exception 'Requested amount exceeds your available balance of SCR %', to_char(greatest(available_amount,0),'FM999999990.00');
  end if;

  insert into public.seller_withdrawal_requests(seller_id,amount_scr,status)
  values(current_seller,requested_amount,'pending') returning id into new_request;

  remaining_amount := requested_amount;
  for earning in
    select e.id,e.amount_scr,
      coalesce((select sum(a.amount_scr)
        from public.seller_withdrawal_allocations a
        join public.seller_withdrawal_requests r on r.id=a.request_id
        where a.earning_id=e.id and r.status in ('pending','processing','paid')),0) as allocated
    from public.seller_earnings e
    where e.seller_id=current_seller and e.status='available'
    order by e.released_at,e.id
    for update
  loop
    exit when remaining_amount <= 0;
    take_amount := least(remaining_amount, earning.amount_scr - earning.allocated);
    if take_amount > 0 then
      insert into public.seller_withdrawal_allocations(request_id,earning_id,amount_scr)
      values(new_request,earning.id,take_amount);
      remaining_amount := remaining_amount - take_amount;
    end if;
  end loop;

  if remaining_amount > 0 then
    raise exception 'Unable to reserve the requested amount. Please refresh and try again.';
  end if;
  return new_request;
end;
$$;
revoke all on function public.seller_request_withdrawal(numeric) from public;
grant execute on function public.seller_request_withdrawal(numeric) to authenticated;
