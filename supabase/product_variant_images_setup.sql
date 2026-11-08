-- Add an optional photo URL to each sellable product variation.
alter table public.product_variants
  add column if not exists image_url text;
