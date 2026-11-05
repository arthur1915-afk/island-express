-- Island Express: disable the previous MFA/AAL2 requirement for admin policies.
-- Admin access remains restricted by profiles.is_admin = true.
-- Run this in Supabase SQL Editor after deploying the updated admin pages.

drop policy if exists "Admins can view all products" on public.products;
create policy "Admins can view all products"
on public.products for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

drop policy if exists "Admins can update product moderation status" on public.products;
create policy "Admins can update product moderation status"
on public.products for update to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true))
with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

drop policy if exists "Admins can view moderation records" on public.product_moderation;
create policy "Admins can view moderation records"
on public.product_moderation for select to authenticated
using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

drop policy if exists "Admins can create moderation records" on public.product_moderation;
create policy "Admins can create moderation records"
on public.product_moderation for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
