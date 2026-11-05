-- Island Express: repair product image upload RLS
-- Run the entire script in Supabase SQL Editor.

-- Ensure the public product image bucket exists with the expected limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- SECURITY DEFINER allows the ownership check to read shops even when
-- shops RLS would otherwise hide the row from the storage policy.
create or replace function public.can_upload_product_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.shops s
    where s.id::text = (storage.foldername(object_name))[1]
      and s.owner_id = auth.uid()
  );
$$;

revoke all on function public.can_upload_product_image(text) from public;
grant execute on function public.can_upload_product_image(text) to authenticated;

-- Remove earlier variants to avoid confusion and install one clear INSERT rule.
drop policy if exists "Shop owners can upload product images" on storage.objects;
drop policy if exists "Authenticated sellers can upload product images to their shop" on storage.objects;

create policy "Authenticated sellers can upload product images to their shop"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and public.can_upload_product_image(name)
);

-- Public read access is required because the app stores public image URLs.
drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects
for select
using (bucket_id = 'product-images');

-- Sellers may delete only files inside their own shop folder.
drop policy if exists "Shop owners can delete their product images" on storage.objects;
create policy "Shop owners can delete their product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and public.can_upload_product_image(name)
);
