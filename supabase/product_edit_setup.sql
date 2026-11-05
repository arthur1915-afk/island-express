-- Island Express: seller product editing and image removal
-- Run once in Supabase SQL Editor.

-- Sellers may edit their own listings. Any content edit is automatically
-- returned to pending_review so an approved listing is not changed publicly
-- until an administrator reviews it again.
drop policy if exists "Owners can update pending or rejected products" on public.products;
drop policy if exists "Sellers can edit own products and resubmit for review" on public.products;
create policy "Sellers can edit own products and resubmit for review"
on public.products for update to authenticated
using (
  exists (
    select 1 from public.shops s
    where s.id = products.shop_id and s.owner_id = auth.uid()
  )
)
with check (
  status = 'pending_review'
  and exists (
    select 1 from public.shops s
    where s.id = products.shop_id and s.owner_id = auth.uid()
  )
);

create or replace function public.mark_product_edits_pending_review()
returns trigger
language plpgsql
as $$
begin
  if row(new.title, new.description, new.category, new.price_scr, new.image_urls)
     is distinct from
     row(old.title, old.description, old.category, old.price_scr, old.image_urls) then
    new.status := 'pending_review';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_require_review_after_seller_edit on public.products;
create trigger products_require_review_after_seller_edit
before update on public.products
for each row execute function public.mark_product_edits_pending_review();

-- Allow a seller to delete only images stored inside their own shop folder.
drop policy if exists "Shop owners can delete their product images" on storage.objects;
create policy "Shop owners can delete their product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.shops s
    where s.id::text = (storage.foldername(name))[1]
      and s.owner_id = auth.uid()
  )
);
