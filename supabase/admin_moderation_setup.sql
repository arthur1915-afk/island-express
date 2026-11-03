-- Island Express admin moderation setup
-- Run once in Supabase SQL Editor.
-- This keeps admin access separate from customer/seller account roles.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

drop policy if exists "Admins can update product moderation status" on public.products;
create policy "Admins can update product moderation status"
on public.products for update to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "Admins can view moderation records" on public.product_moderation;
create policy "Admins can view moderation records"
on public.product_moderation for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

drop policy if exists "Admins can create moderation records" on public.product_moderation;
create policy "Admins can create moderation records"
on public.product_moderation for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Grant admin access to the account used to create Island Express.
-- This does not change its seller role or remove its shop.
update public.profiles
set is_admin = true
where id = (
  select id from auth.users
  where lower(email) = lower('arthur1915@gmail.com')
);
