-- Products submitted by sellers for inclusion in promotional campaigns.
create table if not exists public.promotional_campaign_products (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promotional_campaigns(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (campaign_id, product_id)
);
create index if not exists promotional_campaign_products_campaign_idx
  on public.promotional_campaign_products(campaign_id, created_at desc);
create index if not exists promotional_campaign_products_seller_idx
  on public.promotional_campaign_products(seller_id, created_at desc);
alter table public.promotional_campaign_products enable row level security;
drop policy if exists "Public can view campaign products" on public.promotional_campaign_products;
create policy "Public can view campaign products"
on public.promotional_campaign_products for select
using (
  exists (
    select 1 from public.promotional_campaigns c
    where c.id = campaign_id and c.is_active = true
      and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
  )
);
drop policy if exists "Sellers can submit their own products to live campaigns" on public.promotional_campaign_products;
create policy "Sellers can submit their own products to live campaigns"
on public.promotional_campaign_products for insert to authenticated
with check (
  seller_id = auth.uid()
  and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'seller'
  )
  and exists (
    select 1 from public.shops s
    join public.products pr on pr.shop_id = s.id
    where s.owner_id = auth.uid() and pr.id = product_id
      and pr.status = 'approved'
      and coalesce(pr.is_archived, false) = false
      and coalesce(s.holiday_mode, false) = false
  )
  and exists (
    select 1 from public.promotional_campaigns c
    where c.id = campaign_id and c.is_active = true
      and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
  )
);
drop policy if exists "Sellers can remove their own campaign submissions" on public.promotional_campaign_products;
create policy "Sellers can remove their own campaign submissions"
on public.promotional_campaign_products for delete to authenticated
using (seller_id = auth.uid());
grant select on public.promotional_campaign_products to anon, authenticated;
grant insert, delete on public.promotional_campaign_products to authenticated;


-- Optional campaign-specific discount percentage (0 means no discount).
alter table public.promotional_campaign_products
  add column if not exists discount_percent numeric(5,2) not null default 0
  check (discount_percent >= 0 and discount_percent <= 90);
