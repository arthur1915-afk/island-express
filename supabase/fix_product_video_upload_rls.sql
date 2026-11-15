-- Island Express: fix product video upload RLS
-- The storage policy must check shop ownership through a SECURITY DEFINER
-- function because normal RLS on public.shops can hide the seller's shop row.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-videos',
  'product-videos',
  true,
  52428800,
  ARRAY['video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['video/mp4','video/webm','video/quicktime'];

CREATE OR REPLACE FUNCTION public.can_upload_product_video(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shops s
    WHERE s.id::text = (storage.foldername(object_name))[1]
      AND s.owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.can_upload_product_video(text) FROM public;
GRANT EXECUTE ON FUNCTION public.can_upload_product_video(text) TO authenticated;

DROP POLICY IF EXISTS "Shop owners can upload product videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated sellers can upload product videos to their shop" ON storage.objects;

CREATE POLICY "Authenticated sellers can upload product videos to their shop"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-videos'
  AND public.can_upload_product_video(name)
);

DROP POLICY IF EXISTS "Public can view product videos" ON storage.objects;
CREATE POLICY "Public can view product videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-videos');

DROP POLICY IF EXISTS "Shop owners can delete product videos" ON storage.objects;
CREATE POLICY "Shop owners can delete product videos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-videos'
  AND public.can_upload_product_video(name)
);
