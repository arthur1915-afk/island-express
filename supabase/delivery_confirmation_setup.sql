-- Customer delivery confirmation and seller earnings release
create table if not exists public.seller_earnings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  amount_scr numeric(12,2) not null check (amount_scr >= 0),
  status text not null default 'available' check (status in ('available','withdrawal_pending','paid','reversed')),
  released_at timestamptz not null default now(),
  unique(order_id, shop_id)
);
alter table public.seller_earnings enable row level security;
drop policy if exists "Sellers can view own earnings" on public.seller_earnings;
create policy "Sellers can view own earnings"
on public.seller_earnings for select to authenticated
using (seller_id = auth.uid());

create or replace function public.seller_mark_order_delivered(target_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare owned_shop uuid;
begin
  select s.id into owned_shop
  from public.shops s
  where s.owner_id=auth.uid()
    and exists (
      select 1 from public.order_items oi
      join public.products p on p.id=oi.product_id
      where oi.order_id=target_order_id and p.shop_id=s.id
    )
  limit 1;
  if owned_shop is null then raise exception 'You do not have access to this order'; end if;
  update public.seller_order_fulfillments
  set status='delivered', updated_at=now()
  where order_id=target_order_id and shop_id=owned_shop and status='shipped';
  if not found then raise exception 'Only shipped orders can be marked as delivered'; end if;
end;
$$;
revoke all on function public.seller_mark_order_delivered(uuid) from public;
grant execute on function public.seller_mark_order_delivered(uuid) to authenticated;

create or replace function public.customer_confirm_order_received(target_order_id uuid, target_shop_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  order_customer uuid;
  fulfilment_status text;
  shop_owner uuid;
  shop_amount numeric(12,2);
  paid_status text;
begin
  select o.customer_id, o.payment_status into order_customer, paid_status
  from public.orders o where o.id=target_order_id;
  if order_customer is null or order_customer <> auth.uid() then
    raise exception 'You can only confirm your own order';
  end if;

  select f.status, s.owner_id into fulfilment_status, shop_owner
  from public.seller_order_fulfillments f
  join public.shops s on s.id=f.shop_id
  where f.order_id=target_order_id and f.shop_id=target_shop_id;

  if fulfilment_status is distinct from 'delivered' then
    raise exception 'The seller must mark this delivery as delivered first';
  end if;

  update public.seller_order_fulfillments
  set status='completed', updated_at=now()
  where order_id=target_order_id and shop_id=target_shop_id and status='delivered';

  -- Release card-payment proceeds to the seller's platform balance only after customer confirmation.
  -- COD is settled directly between the customer and seller, not by Island Express.
  if paid_status='paid' then
    select coalesce(sum(oi.unit_price_scr * oi.quantity),0) into shop_amount
    from public.order_items oi
    join public.products p on p.id=oi.product_id
    where oi.order_id=target_order_id and p.shop_id=target_shop_id;

    insert into public.seller_earnings(seller_id,shop_id,order_id,amount_scr,status)
    values(shop_owner,target_shop_id,target_order_id,shop_amount,'available')
    on conflict(order_id,shop_id) do nothing;
  end if;

  -- An order is completed only after every shop represented in its items is customer-confirmed.
  if not exists (
    select 1
    from (
      select distinct p.shop_id
      from public.order_items oi
      join public.products p on p.id=oi.product_id
      where oi.order_id=target_order_id
    ) order_shops
    where not exists (
      select 1 from public.seller_order_fulfillments f
      where f.order_id=target_order_id
        and f.shop_id=order_shops.shop_id
        and f.status='completed'
    )
  ) then
    update public.orders set status='completed' where id=target_order_id;
  end if;
end;
$$;
revoke all on function public.customer_confirm_order_received(uuid,uuid) from public;
grant execute on function public.customer_confirm_order_received(uuid,uuid) to authenticated;
