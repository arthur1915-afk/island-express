-- Admin-managed product display figures for Island Express.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS display_sold_count INTEGER NOT NULL DEFAULT 0 CHECK (display_sold_count >= 0),
  ADD COLUMN IF NOT EXISTS display_rating NUMERIC(2,1) CHECK (display_rating IS NULL OR display_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS display_review_count INTEGER NOT NULL DEFAULT 0 CHECK (display_review_count >= 0),
  ADD COLUMN IF NOT EXISTS display_review_text TEXT;

DROP POLICY IF EXISTS "Admins can view all products" ON public.products;
CREATE POLICY "Admins can view all products" ON public.products FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_admin=true));

DROP POLICY IF EXISTS "Admins can update product moderation status" ON public.products;
DROP POLICY IF EXISTS "Admins can update product display figures" ON public.products;
CREATE POLICY "Admins can update product display figures" ON public.products FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_admin=true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_admin=true));

-- Ensure administrators can read and update product display fields.
DROP POLICY IF EXISTS "Admins can view all products" ON public.products;
CREATE POLICY "Admins can view all products" ON public.products FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_admin=true));

DROP POLICY IF EXISTS "Admins can update product display figures" ON public.products;
CREATE POLICY "Admins can update product display figures" ON public.products FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_admin=true))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_admin=true));

-- Allow administrators to see shop names even for inactive shops in the selector.
DROP POLICY IF EXISTS "Admins can view all shops" ON public.shops;
CREATE POLICY "Admins can view all shops" ON public.shops FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.is_admin=true));
