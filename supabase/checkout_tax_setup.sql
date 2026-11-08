-- Island Express checkout tax: 16% on the full item subtotal when it is SCR 2,900 or above.
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS tax_scr numeric(12,2) NOT NULL DEFAULT 0;
