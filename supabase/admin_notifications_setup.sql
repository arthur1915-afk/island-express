-- Admin notifications for Island Express.
-- Run this once in Supabase SQL Editor after notifications_setup.sql.

create or replace function public.notify_admin_new_product_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shop_label text;
begin
  if new.status <> 'pending_review' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select name into shop_label from public.shops where id = new.shop_id;

  insert into public.notifications(user_id, notification_type, title, message)
  select p.id, 'admin_new_listing', 'New listing awaiting review',
    coalesce(shop_label, 'A seller') || ' submitted "' || coalesce(new.title, 'a product') || '" for approval.'
  from public.profiles p
  where p.is_admin = true;

  return new;
end;
$$;

drop trigger if exists notify_admin_new_product_submission on public.products;
create trigger notify_admin_new_product_submission
after insert or update of status on public.products
for each row execute function public.notify_admin_new_product_submission();


create or replace function public.notify_admin_cancellation_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shop_label text;
  order_ref text;
begin
  if new.status <> 'cancellation_requested' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select s.name, upper(left(o.id::text, 8))
    into shop_label, order_ref
  from public.orders o
  join public.shops s on s.id = new.shop_id
  where o.id = new.order_id;

  insert into public.notifications(user_id, order_id, notification_type, title, message)
  select p.id, new.order_id, 'admin_cancellation_request',
    'Seller cancellation request needs review',
    coalesce(shop_label, 'A seller') || ' requested cancellation of order ' ||
    coalesce(order_ref, upper(left(new.order_id::text, 8))) ||
    '. Reason: ' || coalesce(new.seller_note, 'Not provided') || '.'
  from public.profiles p
  where p.is_admin = true;

  return new;
end;
$$;

drop trigger if exists notify_admin_cancellation_request on public.seller_order_fulfillments;
create trigger notify_admin_cancellation_request
after insert or update of status on public.seller_order_fulfillments
for each row execute function public.notify_admin_cancellation_request();


-- Enable live notification toasts and unread-count updates through Supabase Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;


-- Notify administrators when a customer places a new order.
create or replace function public.notify_admin_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(user_id, order_id, notification_type, title, message)
  select p.id, new.id, 'admin_new_order', 'New customer order received',
    coalesce(new.customer_name, 'A customer') || ' placed order ' ||
    upper(left(new.id::text, 8)) || ' for SCR ' ||
    to_char(coalesce(new.total_scr, 0), 'FM999999990.00') || '.'
  from public.profiles p
  where p.is_admin = true;

  return new;
end;
$$;

drop trigger if exists notify_admin_new_order on public.orders;
create trigger notify_admin_new_order
after insert on public.orders
for each row execute function public.notify_admin_new_order();
