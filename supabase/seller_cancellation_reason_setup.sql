-- Require a meaningful reason whenever a seller requests order cancellation.
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

  if next_status = 'cancellation_requested' and (note is null or length(trim(note)) < 10) then
    raise exception 'Please provide a cancellation reason of at least 10 characters';
  end if;

  select s.id into owned_shop
  from public.shops s
  where s.owner_id=auth.uid()
    and exists(
      select 1 from public.order_items oi
      join public.products p on p.id=oi.product_id
      where oi.order_id=target_order_id and p.shop_id=s.id
    )
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
  if current_status='cancellation_requested' and next_status <> 'cancellation_requested' then
    raise exception 'Cancellation is awaiting admin review';
  end if;

  insert into public.seller_order_fulfillments(order_id,shop_id,status,tracking_number,courier,seller_note,updated_at)
  values(target_order_id,owned_shop,next_status,nullif(trim(tracking),''),nullif(trim(courier_name),''),nullif(trim(note),''),now())
  on conflict(order_id,shop_id) do update set
    status=excluded.status,
    tracking_number=coalesce(excluded.tracking_number,seller_order_fulfillments.tracking_number),
    courier=coalesce(excluded.courier,seller_order_fulfillments.courier),
    seller_note=case when next_status='cancellation_requested' then excluded.seller_note else coalesce(excluded.seller_note,seller_order_fulfillments.seller_note) end,
    updated_at=now();
end;
$$;

revoke all on function public.seller_set_fulfilment(uuid,text,text,text,text) from public;
grant execute on function public.seller_set_fulfilment(uuid,text,text,text,text) to authenticated;
