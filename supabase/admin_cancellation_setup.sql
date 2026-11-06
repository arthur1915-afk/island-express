-- Ensure notification storage exists even if the optional notifications migration has not yet been run.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications" on public.notifications for select to authenticated using (auth.uid()=user_id);
drop policy if exists "Users can mark own notifications read" on public.notifications;
create policy "Users can mark own notifications read" on public.notifications for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
revoke insert,delete on public.notifications from anon,authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;

-- Admin approval workflow for seller-requested order cancellations.
-- Run this migration in Supabase SQL Editor after deploying the application.

alter table public.seller_order_fulfillments
  add column if not exists cancellation_previous_status text;

-- Preserve the fulfilment state so a rejected request can restore it.
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
    and exists (
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

  insert into public.seller_order_fulfillments(
    order_id,shop_id,status,tracking_number,courier,seller_note,cancellation_previous_status,updated_at
  )
  values(
    target_order_id,owned_shop,next_status,nullif(trim(tracking),''),nullif(trim(courier_name),''),
    nullif(trim(note),''),case when next_status='cancellation_requested' then coalesce(current_status,'new') else null end,now()
  )
  on conflict(order_id,shop_id) do update set
    status=excluded.status,
    tracking_number=coalesce(excluded.tracking_number,seller_order_fulfillments.tracking_number),
    courier=coalesce(excluded.courier,seller_order_fulfillments.courier),
    seller_note=case when next_status='cancellation_requested' then excluded.seller_note else coalesce(excluded.seller_note,seller_order_fulfillments.seller_note) end,
    cancellation_previous_status=case when next_status='cancellation_requested' then coalesce(seller_order_fulfillments.status,'new') else seller_order_fulfillments.cancellation_previous_status end,
    updated_at=now();
end;
$$;
revoke all on function public.seller_set_fulfilment(uuid,text,text,text,text) from public;
grant execute on function public.seller_set_fulfilment(uuid,text,text,text,text) to authenticated;

create or replace function public.admin_list_cancellation_requests()
returns table(
  request_id uuid, order_id uuid, shop_id uuid, seller_id uuid,
  status text, seller_note text, requested_at timestamptz,
  shop_name text, customer_name text, customer_id uuid, total_scr numeric
)
language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true) then
    raise exception 'Administrator access required';
  end if;
  return query
  select f.id, f.order_id, f.shop_id, s.owner_id, f.status, f.seller_note,
         f.updated_at, s.name, o.customer_name, o.customer_id, o.total_scr
  from public.seller_order_fulfillments f
  join public.orders o on o.id=f.order_id
  join public.shops s on s.id=f.shop_id
  where f.status='cancellation_requested'
  order by f.updated_at asc;
end;
$$;

create or replace function public.admin_decide_cancellation(
  target_order_id uuid,
  target_shop_id uuid,
  decision text,
  admin_note text default null
) returns void
language plpgsql security definer set search_path=public
as $$
declare
  req public.seller_order_fulfillments%rowtype;
  customer uuid;
  seller uuid;
  order_ref text;
  shop_label text;
  restored_status text;
  notification_message text;
begin
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true) then
    raise exception 'Administrator access required';
  end if;
  if decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;

  select f.* into req
  from public.seller_order_fulfillments f
  where f.order_id=target_order_id and f.shop_id=target_shop_id
  for update;
  if not found or req.status <> 'cancellation_requested' then
    raise exception 'This cancellation request is no longer awaiting review';
  end if;

  select o.customer_id, s.owner_id, upper(left(o.id::text,8)), s.name
    into customer, seller, order_ref, shop_label
  from public.orders o join public.shops s on s.id=target_shop_id
  where o.id=target_order_id;

  if decision='approved' then
    update public.seller_order_fulfillments
      set status='cancelled', seller_note=coalesce(nullif(trim(admin_note),''),seller_note),
          cancellation_previous_status=null, updated_at=now()
      where id=req.id;
    notification_message := 'Admin approved the cancellation requested by '||coalesce(shop_label,'the seller')||
      ' for order '||order_ref||'. '||coalesce(nullif(trim(admin_note),''),'');
    -- Mark the parent order cancelled only when every shop in the order is cancelled.
    if not exists (
      select 1 from public.order_items oi
      join public.products p on p.id=oi.product_id
      where oi.order_id=target_order_id
        and not exists (
          select 1 from public.seller_order_fulfillments f
          where f.order_id=target_order_id and f.shop_id=p.shop_id and f.status='cancelled'
        )
    ) then
      update public.orders set status='cancelled' where id=target_order_id;
    end if;
  else
    restored_status := coalesce(req.cancellation_previous_status,'processing');
    if restored_status not in ('new','processing') then restored_status := 'processing'; end if;
    update public.seller_order_fulfillments
      set status=restored_status,
          seller_note=coalesce(nullif(trim(admin_note),''),seller_note),
          cancellation_previous_status=null, updated_at=now()
      where id=req.id;
    notification_message := 'Admin rejected the cancellation requested by '||coalesce(shop_label,'the seller')||
      ' for order '||order_ref||'. The order remains active. '||coalesce(nullif(trim(admin_note),''),'');
  end if;

  insert into public.notifications(user_id,order_id,notification_type,title,message)
  values
    (customer,target_order_id,case when decision='approved' then 'order_cancellation_approved' else 'order_cancellation_rejected' end,
     case when decision='approved' then 'Cancellation approved' else 'Cancellation request declined' end,notification_message),
    (seller,target_order_id,case when decision='approved' then 'seller_cancellation_approved' else 'seller_cancellation_rejected' end,
     case when decision='approved' then 'Your cancellation was approved' else 'Your cancellation was rejected' end,notification_message);
end;
$$;

revoke all on function public.admin_list_cancellation_requests() from public;
revoke all on function public.admin_decide_cancellation(uuid,uuid,text,text) from public;
grant execute on function public.admin_list_cancellation_requests() to authenticated;
grant execute on function public.admin_decide_cancellation(uuid,uuid,text,text) to authenticated;
