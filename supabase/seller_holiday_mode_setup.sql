-- Seller holiday mode: hide all of a shop's listings from public shoppers.
alter table public.shops
  add column if not exists holiday_mode boolean not null default false;

-- Enforce visibility at the database level so hidden listings cannot be
-- reached through search, product URLs, carts, or direct Supabase queries.
drop policy if exists "Public can view approved products" on public.products;
create policy "Public can view approved products"
on public.products
for select
using (
  status = 'approved'
  and exists (
    select 1
    from public.shops s
    where s.id = products.shop_id
      and s.is_active = true
      and s.holiday_mode = false
  )
);

-- Shop owners may update their own shop settings (including holiday_mode).
drop policy if exists "Owners can update shops" on public.shops;
create policy "Owners can update shops"
on public.shops
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
