-- Notify sellers only after the customer's order is successfully confirmed/paid.
-- Also enables realtime delivery for in-app notification pop-ups.
create or replace function public.notify_sellers_when_order_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_row record;
  order_ref text;
begin
  if new.status is distinct from old.status and new.status = 'confirmed' then
    order_ref := upper(left(new.id::text, 8));

    for seller_row in
      select s.owner_id, s.id as shop_id, s.name as shop_name,
             count(oi.id)::integer as item_count
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      join public.shops s on s.id = p.shop_id
      where oi.order_id = new.id
      group by s.owner_id, s.id, s.name
    loop
      if not exists (
        select 1 from public.notifications n
        where n.user_id = seller_row.owner_id
          and n.order_id = new.id
          and n.notification_type = 'new_order:' || seller_row.shop_id::text
      ) then
        insert into public.notifications(user_id, order_id, notification_type, title, message)
        values (
          seller_row.owner_id,
          new.id,
          'new_order:' || seller_row.shop_id::text,
          'New order received',
          'Order ' || order_ref || ' has been paid and confirmed. ' ||
          seller_row.item_count::text || ' item(s) from ' || seller_row.shop_name ||
          ' are ready for you to process.'
        );
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- Remove the earlier per-line-item trigger so unpaid orders do not alert sellers.
drop trigger if exists notify_seller_new_order_item on public.order_items;
drop trigger if exists notify_sellers_when_order_confirmed on public.orders;
create trigger notify_sellers_when_order_confirmed
after update of status on public.orders
for each row execute function public.notify_sellers_when_order_confirmed();

-- Realtime is used by the site-wide pop-up listener.
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
end $$;
