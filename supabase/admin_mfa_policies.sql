-- Require a verified Supabase MFA session (AAL2) for administrator actions.
drop policy if exists "Admins can view all products" on public.products;
create policy "Admins can view all products"
on public.products for select to authenticated
using (
  (auth.jwt()->>'aal') = 'aal2'
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
);

drop policy if exists "Admins can update product moderation status" on public.products;
create policy "Admins can update product moderation status"
on public.products for update to authenticated
using (
  (auth.jwt()->>'aal') = 'aal2'
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
)
with check (
  (auth.jwt()->>'aal') = 'aal2'
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
);

drop policy if exists "Admins can view moderation records" on public.product_moderation;
create policy "Admins can view moderation records"
on public.product_moderation for select to authenticated
using (
  (auth.jwt()->>'aal') = 'aal2'
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
);

drop policy if exists "Admins can create moderation records" on public.product_moderation;
create policy "Admins can create moderation records"
on public.product_moderation for insert to authenticated
with check (
  (auth.jwt()->>'aal') = 'aal2'
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
);
