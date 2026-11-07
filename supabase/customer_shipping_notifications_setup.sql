-- Customer shipping and order lifecycle notifications.
-- Run this once in Supabase SQL Editor after the notifications table exists.

create or replace function public.notify_customer_fulfilment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer uuid;
  order_ref text;
  shop_name text;
  notification_title text;
  notification_message text;
  status_changed boolean;
  shipping_changed boolean;
begin
  status_changed := tg_op = 'INSERT'
    or new.status is distinct from old.status;

  shipping_changed := tg_op = 'INSERT'
    or new.tracking_number is distinct from old.tracking_number
    or new.courier is distinct from old.courier
    or new.estimated_delivery is distinct from old.estimated_delivery
    or new.shipping_note is distinct from old.shipping_note;

  -- Ignore edits that do not change a customer-visible fulfilment detail.
  if not status_changed and not shipping_changed then
    return new;
  end if;

  select o.customer_id, upper(left(o.id::text, 8)), s.name
    into customer, order_ref, shop_name
  from public.orders o
  join public.shops s on s.id = new.shop_id
  where o.id = new.order_id;

  if customer is null then
    return new;
  end if;

  if new.status = 'cancellation_requested' and status_changed then
    notification_title := 'Seller requested order cancellation';
    notification_message := coalesce(shop_name, 'A seller') ||
      ' requested to cancel order ' || order_ref || '. Reason: ' ||
      coalesce(new.seller_note, 'Not provided') ||
      '. The request is awaiting review.';
  elsif new.status = 'cancelled' and status_changed then
    notification_title := 'Order cancellation confirmed';
    notification_message := coalesce(shop_name, 'The seller') ||
      ' cancelled order ' || order_ref || '. ' ||
      coalesce(new.seller_note, '');
  elsif new.status = 'shipped' and status_changed then
    notification_title := 'Your order has shipped';
    notification_message := coalesce(shop_name, 'The seller') ||
      ' has shipped order ' || order_ref ||
      coalesce(' with ' || nullif(new.courier, ''), '') ||
      coalesce('. Tracking: ' || nullif(new.tracking_number, ''), '') ||
      coalesce('. Estimated delivery: ' || to_char(new.estimated_delivery, 'DD Mon YYYY'), '') ||
      coalesce('. ' || nullif(new.shipping_note, ''), '');
  elsif new.status = 'shipped' and shipping_changed then
    notification_title := 'Shipping details updated';
    notification_message := 'There is a new shipping update for order ' ||
      order_ref || ' from ' || coalesce(shop_name, 'your seller') || '.' ||
      coalesce(' Courier: ' || nullif(new.courier, ''), '') ||
      coalesce(' Tracking number: ' || nullif(new.tracking_number, ''), '') ||
      coalesce(' Estimated delivery: ' || to_char(new.estimated_delivery, 'DD Mon YYYY'), '') ||
      coalesce(' Update: ' || nullif(new.shipping_note, ''), '');
  elsif new.status = 'delivered' and status_changed then
    notification_title := 'Order marked as delivered';
    notification_message := coalesce(shop_name, 'The seller') ||
      ' marked order ' || order_ref ||
      ' as delivered. Please confirm receipt in My Orders.';
  elsif new.status = 'completed' and status_changed then
    notification_title := 'Order completed';
    notification_message := 'Order ' || order_ref ||
      ' has been completed. Thank you for shopping with Island Express.';
  elsif new.status = 'processing' and status_changed then
    notification_title := 'Seller is preparing your order';
    notification_message := coalesce(shop_name, 'The seller') ||
      ' has started processing order ' || order_ref || '.';
  else
    -- Shipping edits before dispatch are visible in My Orders but do not
    -- generate a distracting notification until the parcel is shipped.
    return new;
  end if;

  insert into public.notifications(user_id, order_id, notification_type, title, message)
  values (
    customer,
    new.order_id,
    case
      when new.status = 'shipped' and status_changed then 'order_shipped'
      when new.status = 'shipped' then 'shipping_update'
      else 'order_' || new.status
    end,
    notification_title,
    notification_message
  );

  return new;
end;
$$;

drop trigger if exists notify_customer_fulfilment_change
  on public.seller_order_fulfillments;

create trigger notify_customer_fulfilment_change
after insert or update on public.seller_order_fulfillments
for each row
execute function public.notify_customer_fulfilment_change();

-- Ensure parent-order confirmations and cancellations are also notified.
create or replace function public.notify_customer_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      insert into public.notifications(user_id, order_id, notification_type, title, message)
      values (new.customer_id, new.id, 'order_confirmed', 'Order confirmed',
        'Your order ' || upper(left(new.id::text, 8)) || ' has been confirmed.');
    elsif new.status = 'cancelled' then
      insert into public.notifications(user_id, order_id, notification_type, title, message)
      values (new.customer_id, new.id, 'order_cancelled', 'Order cancelled',
        'Your order ' || upper(left(new.id::text, 8)) || ' has been cancelled.');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_customer_order_change on public.orders;
create trigger notify_customer_order_change
after update of status on public.orders
for each row
execute function public.notify_customer_order_change();

-- Realtime is required for the site-wide notification pop-up.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
