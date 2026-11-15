ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shipping_fee_scr numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_fee_scr >= 0);
CREATE TABLE IF NOT EXISTS public.admin_product_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
 shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
 source_url text NOT NULL, source_platform text NOT NULL,
 source_price numeric(12,2), source_currency text,
 exchange_rate_to_scr numeric(18,8), cost_scr numeric(12,2),
 markup_percent numeric(5,2) NOT NULL DEFAULT 20,
 supplier_shipping_scr numeric(12,2), supplier_shipping_status text NOT NULL DEFAULT 'unavailable',
 imported_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_product_imports ENABLE ROW LEVEL SECURITY;