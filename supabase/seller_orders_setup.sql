-- Island Express seller order visibility
-- Sellers can view only orders that contain one of their shop's products.
drop policy if exists "Sellers can view orders containing their products" on public.orders;
create policy "Sellers can view orders containing their products"
on public.orders for select to authenticated
using (
  exists (
    select 1
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    join public.shops s on s.id = p.shop_id
    where oi.order_id = orders.id
      and s.owner_id = auth.uid()
  )
);

drop policy if exists "Sellers can view their order items" on public.order_items;
create policy "Sellers can view their order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1
    from public.products p
    join public.shops s on s.id = p.shop_id
    where p.id = order_items.product_id
      and s.owner_id = auth.uid()
  )
);
