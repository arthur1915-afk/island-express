alter table public.shop_vouchers
  add column if not exists applies_to_all_products boolean not null default true;

create table if not exists public.shop_voucher_products (
  voucher_id uuid not null references public.shop_vouchers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (voucher_id, product_id)
);

alter table public.shop_voucher_products enable row level security;

drop policy if exists "Sellers can view own voucher product targets" on public.shop_voucher_products;
create policy "Sellers can view own voucher product targets"
on public.shop_voucher_products for select to authenticated
using (exists (
  select 1 from public.shop_vouchers v
  join public.shops s on s.id = v.shop_id
  where v.id = voucher_id and s.owner_id = auth.uid()
));

drop policy if exists "Sellers can manage own voucher product targets" on public.shop_voucher_products;
create policy "Sellers can manage own voucher product targets"
on public.shop_voucher_products for all to authenticated
using (exists (
  select 1 from public.shop_vouchers v
  join public.shops s on s.id = v.shop_id
  where v.id = voucher_id and s.owner_id = auth.uid()
))
with check (
  exists (
    select 1 from public.shop_vouchers v
    join public.shops s on s.id = v.shop_id
    join public.products p on p.id = product_id and p.shop_id = v.shop_id
    where v.id = voucher_id and s.owner_id = auth.uid()
  )
);

grant select, insert, update, delete on public.shop_voucher_products to authenticated;
