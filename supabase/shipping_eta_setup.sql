-- Seller-managed shipping details and estimated delivery dates
alter table public.seller_order_fulfillments
  add column if not exists estimated_delivery date,
  add column if not exists shipping_note text;

create or replace function public.seller_update_shipping(
  target_order_id uuid,
  courier_name text default null,
  tracking text default null,
  eta_date date default null,
  customer_note text default null
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  owned_shop uuid;
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

  if owned_shop is null then
    raise exception 'You do not have access to this order';
  end if;

  insert into public.seller_order_fulfillments
    (order_id,shop_id,status,courier,tracking_number,estimated_delivery,shipping_note,updated_at)
  values
    (target_order_id,owned_shop,'processing',nullif(trim(courier_name),''),nullif(trim(tracking),''),eta_date,nullif(trim(customer_note),''),now())
  on conflict(order_id,shop_id) do update set
    courier=excluded.courier,
    tracking_number=excluded.tracking_number,
    estimated_delivery=excluded.estimated_delivery,
    shipping_note=excluded.shipping_note,
    updated_at=now();
end;
$$;

revoke all on function public.seller_update_shipping(uuid,text,text,date,text) from public;
grant execute on function public.seller_update_shipping(uuid,text,text,date,text) to authenticated;
