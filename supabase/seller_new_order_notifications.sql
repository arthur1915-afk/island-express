-- Notify each shop owner when a new order item is created for their product.
-- Run this migration once in the Supabase SQL Editor.

create or replace function public.notify_seller_new_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_user_id uuid;
  order_ref text;
  customer text;
  product_shop_name text;
begin
  select s.owner_id, upper(left(o.id::text, 8)), o.customer_name, s.name
    into seller_user_id, order_ref, customer, product_shop_name
  from public.products p
  join public.shops s on s.id = p.shop_id
  join public.orders o on o.id = new.order_id
  where p.id = new.product_id;

  if seller_user_id is null then
    return new;
  end if;

  insert into public.notifications(user_id, order_id, notification_type, title, message)
  values (
    seller_user_id,
    new.order_id,
    'new_order',
    'New customer order',
    'You have a new order ' || coalesce(order_ref, '') ||
      ' for ' || coalesce(new.product_title, 'your product') ||
      ' × ' || new.quantity::text ||
      ' from ' || coalesce(customer, 'a customer') ||
      ' in ' || coalesce(product_shop_name, 'your shop') || '.'
  );

  return new;
end;
$$;

drop trigger if exists notify_seller_new_order_item on public.order_items;
create trigger notify_seller_new_order_item
after insert on public.order_items
for each row
execute function public.notify_seller_new_order_item();

-- Ensure notification inserts can be received through Supabase Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
