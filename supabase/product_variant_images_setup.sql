-- Island Express: enable photos on individual product variations.
-- Run this entire script in the Supabase SQL Editor.

alter table public.product_variants
  add column if not exists image_url text;

-- Ensure the public product image bucket accepts supported image formats.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Shop owners can upload both main product photos and variation photos.
drop policy if exists "Shop owners can upload product images" on storage.objects;
create policy "Shop owners can upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.shops s
    where s.id::text = (storage.foldername(name))[1]
      and s.owner_id = auth.uid()
  )
);

-- Product photos must be publicly readable on marketplace listings.
drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects for select
using (bucket_id = 'product-images');
