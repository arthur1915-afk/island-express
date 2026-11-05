-- Island Express customer notifications
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
create index if not exists notifications_user_unread_idx on public.notifications(user_id) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists "Users can view own notifications" on public.notifications;
create policy "Users can view own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can mark own notifications read" on public.notifications;
create policy "Users can mark own notifications read" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke insert, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify_customer_order_change()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      insert into public.notifications(user_id, order_id, notification_type, title, message)
      values(new.customer_id, new.id, 'order_confirmed', 'Order confirmed', 'Your order ' || upper(left(new.id::text, 8)) || ' has been confirmed.');
    elsif new.status = 'cancelled' then
      insert into public.notifications(user_id, order_id, notification_type, title, message)
      values(new.customer_id, new.id, 'order_cancelled', 'Order cancelled', 'Your order ' || upper(left(new.id::text, 8)) || ' has been cancelled.');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_customer_order_change on public.orders;
create trigger notify_customer_order_change after update of status on public.orders
for each row execute function public.notify_customer_order_change();

create or replace function public.notify_customer_fulfilment_change()
returns trigger language plpgsql security definer set search_path=public
as $$
declare customer uuid; order_ref text; shop_name text; notification_title text; notification_message text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status
     and new.tracking_number is not distinct from old.tracking_number
     and new.courier is not distinct from old.courier
     and new.shipping_note is not distinct from old.shipping_note
     and new.seller_note is not distinct from old.seller_note then
    return new;
  end if;
  select o.customer_id, upper(left(o.id::text,8)), s.name
    into customer, order_ref, shop_name
  from public.orders o join public.shops s on s.id=new.shop_id
  where o.id=new.order_id;
  if customer is null then return new; end if;
  if new.status = 'cancellation_requested' then
    notification_title := 'Seller requested order cancellation';
    notification_message := coalesce(shop_name,'A seller') || ' requested to cancel order ' || order_ref || '. Reason: ' || coalesce(new.seller_note,'Not provided') || '. The request is awaiting review.';
  elsif new.status = 'cancelled' then
    notification_title := 'Order cancellation confirmed';
    notification_message := coalesce(shop_name,'The seller') || ' cancelled order ' || order_ref || '. ' || coalesce(new.seller_note,'');
  elsif new.status = 'shipped' then
    notification_title := 'Your order has shipped';
    notification_message := coalesce(shop_name,'The seller') || ' has shipped order ' || order_ref || coalesce(' with ' || new.courier,'') || coalesce('. Tracking: ' || new.tracking_number,'') || coalesce('. ' || new.shipping_note,'');
  elsif new.status = 'delivered' then
    notification_title := 'Order marked as delivered';
    notification_message := coalesce(shop_name,'The seller') || ' marked order ' || order_ref || ' as delivered. Please confirm receipt in My Orders.';
  elsif new.status = 'completed' then
    notification_title := 'Order completed';
    notification_message := 'Order ' || order_ref || ' has been completed. Thank you for shopping with Island Express.';
  elsif new.status = 'processing' then
    notification_title := 'Seller is preparing your order';
    notification_message := coalesce(shop_name,'The seller') || ' has started processing order ' || order_ref || '.';
  else
    return new;
  end if;
  insert into public.notifications(user_id, order_id, notification_type, title, message)
  values(customer, new.order_id, new.status, notification_title, notification_message);
  return new;
end;
$$;
drop trigger if exists notify_customer_fulfilment_change on public.seller_order_fulfillments;
create trigger notify_customer_fulfilment_change after insert or update on public.seller_order_fulfillments
for each row execute function public.notify_customer_fulfilment_change();
