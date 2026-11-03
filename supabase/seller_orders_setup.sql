-- Island Express seller order visibility
-- SECURITY DEFINER avoids circular row-level-security checks between orders and order_items.
create or replace function public.seller_owns_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    join public.shops s on s.id = p.shop_id
    where oi.order_id = target_order_id
      and s.owner_id = auth.uid()
  );
$$;

revoke all on function public.seller_owns_order(uuid) from public;
grant execute on function public.seller_owns_order(uuid) to authenticated;

drop policy if exists "Sellers can view orders containing their products" on public.orders;
create policy "Sellers can view orders containing their products"
on public.orders for select to authenticated
using (public.seller_owns_order(id));

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
