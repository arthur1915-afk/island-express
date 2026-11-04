-- Seller fulfilment, stock controls and safe product archiving
alter table public.products add column if not exists is_archived boolean not null default false;

drop policy if exists "Public can view approved products" on public.products;
create policy "Public can view approved products"
on public.products for select
using (status = 'approved' and is_archived = false);

create table if not exists public.seller_order_fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing','shipped','delivered','completed','cancellation_requested','cancelled')),
  tracking_number text,
  courier text,
  seller_note text,
  updated_at timestamptz not null default now(),
  unique(order_id, shop_id)
);
alter table public.seller_order_fulfillments enable row level security;

drop policy if exists "Sellers view own fulfilments" on public.seller_order_fulfillments;
create policy "Sellers view own fulfilments"
on public.seller_order_fulfillments for select to authenticated
using (exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));

drop policy if exists "Customers view order fulfilments" on public.seller_order_fulfillments;
create policy "Customers view order fulfilments"
on public.seller_order_fulfillments for select to authenticated
using (exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid()));

create or replace function public.seller_set_fulfilment(
  target_order_id uuid,
  next_status text,
  tracking text default null,
  courier_name text default null,
  note text default null
) returns void
language plpgsql security definer set search_path=public
as $$
declare
  owned_shop uuid;
  current_status text;
begin
  if next_status not in ('processing','shipped','delivered','cancellation_requested') then
    raise exception 'Invalid seller order action';
  end if;
  select s.id into owned_shop
  from public.shops s
  where s.owner_id=auth.uid()
    and exists(select 1 from public.order_items oi join public.products p on p.id=oi.product_id
               where oi.order_id=target_order_id and p.shop_id=s.id)
  limit 1;
  if owned_shop is null then raise exception 'You do not have access to this order'; end if;

  select f.status into current_status
  from public.seller_order_fulfillments f
  where f.order_id=target_order_id and f.shop_id=owned_shop;

  if next_status='shipped' and (tracking is null or length(trim(tracking))=0) then
    raise exception 'Enter a tracking number before marking this order as shipped';
  end if;
  if current_status in ('shipped','delivered','completed','cancelled') and next_status='cancellation_requested' then
    raise exception 'This order can no longer be cancelled by the seller';
  end if;
  if current_status='cancellation_requested' and next_status not in ('cancellation_requested') then
    raise exception 'Cancellation is awaiting admin review';
  end if;
  insert into public.seller_order_fulfillments(order_id,shop_id,status,tracking_number,courier,seller_note,updated_at)
  values(target_order_id,owned_shop,next_status,nullif(trim(tracking),''),nullif(trim(courier_name),''),nullif(trim(note),''),now())
  on conflict(order_id,shop_id) do update set
    status=excluded.status,
    tracking_number=coalesce(excluded.tracking_number,seller_order_fulfillments.tracking_number),
    courier=coalesce(excluded.courier,seller_order_fulfillments.courier),
    seller_note=coalesce(excluded.seller_note,seller_order_fulfillments.seller_note),
    updated_at=now();
end;
$$;
revoke all on function public.seller_set_fulfilment(uuid,text,text,text,text) from public;
grant execute on function public.seller_set_fulfilment(uuid,text,text,text,text) to authenticated;

create or replace function public.seller_adjust_stock(target_product_id uuid, stock_change integer)
returns integer
language plpgsql security definer set search_path=public
as $$
declare new_stock integer;
begin
  if stock_change=0 then raise exception 'Enter a stock adjustment'; end if;
  update public.products p
  set stock_quantity=p.stock_quantity+stock_change, updated_at=now()
  from public.shops s
  where p.id=target_product_id and p.shop_id=s.id and s.owner_id=auth.uid()
    and p.stock_quantity+stock_change>=0 and p.is_archived=false
  returning p.stock_quantity into new_stock;
  if new_stock is null then raise exception 'Product not found or stock cannot be negative'; end if;
  return new_stock;
end;
$$;
revoke all on function public.seller_adjust_stock(uuid,integer) from public;
grant execute on function public.seller_adjust_stock(uuid,integer) to authenticated;

create or replace function public.seller_archive_product(target_product_id uuid)
returns void
language plpgsql security definer set search_path=public
as $$
begin
  update public.products p set is_archived=true, updated_at=now()
  from public.shops s
  where p.id=target_product_id and p.shop_id=s.id and s.owner_id=auth.uid();
  if not found then raise exception 'Product not found or you do not own it'; end if;
end;
$$;
revoke all on function public.seller_archive_product(uuid) from public;
grant execute on function public.seller_archive_product(uuid) to authenticated;
