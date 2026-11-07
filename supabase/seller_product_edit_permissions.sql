-- Allow sellers to edit their own approved listings, but send edits back through moderation.
drop policy if exists "Owners can update pending or rejected products" on public.products;
create policy "Owners can edit own listings and resubmit for review"
on public.products for update to authenticated
using (
  status in ('approved','pending_review','rejected')
  and exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid())
)
with check (
  status in ('pending_review','rejected')
  and exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid())
);

-- Variant management is available only while the listing is editable / awaiting review.
drop policy if exists "Sellers can manage variants for own editable products" on public.product_variants;
create policy "Sellers can manage variants for own editable products"
on public.product_variants for all to authenticated
using (
  exists(select 1 from public.products p join public.shops s on s.id=p.shop_id
    where p.id=product_id and s.owner_id=auth.uid()
    and p.status in ('pending_review','rejected'))
)
with check (
  exists(select 1 from public.products p join public.shops s on s.id=p.shop_id
    where p.id=product_id and s.owner_id=auth.uid()
    and p.status in ('pending_review','rejected'))
);
