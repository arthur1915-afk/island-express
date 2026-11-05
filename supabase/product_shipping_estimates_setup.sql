-- Add seller-defined estimated shipping time to product listings.
alter table public.products
  add column if not exists shipping_days_min integer,
  add column if not exists shipping_days_max integer;

alter table public.products
  drop constraint if exists products_shipping_days_valid;

alter table public.products
  add constraint products_shipping_days_valid
  check (
    (shipping_days_min is null and shipping_days_max is null)
    or
    (shipping_days_min between 1 and 90
      and shipping_days_max between shipping_days_min and 90)
  );
