-- Island Express product video support
-- Run once in Supabase SQL Editor.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_video_urls TEXT[] NOT NULL DEFAULT '{}';

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

DROP POLICY IF EXISTS "Shop owners can upload product videos" ON storage.objects;
CREATE POLICY "Shop owners can upload product videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-videos'
  AND EXISTS (
    SELECT 1 FROM public.shops s
    WHERE s.id::text = (storage.foldername(name))[1]
      AND s.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Public can view product videos" ON storage.objects;
CREATE POLICY "Public can view product videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-videos');
