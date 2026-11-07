-- Product variations: each row is a sellable option/combination with its own price and stock.
create table if not exists public.product_variants (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete cascade,
 label text not null,
 attributes jsonb not null default '{}'::jsonb,
 price_scr numeric(12,2) not null check(price_scr >= 0),
 stock_quantity integer not null default 0 check(stock_quantity >= 0),
 sku text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(product_id,label)
);
create index if not exists product_variants_product_id_idx on public.product_variants(product_id);
alter table public.product_variants enable row level security;
drop policy if exists "Public can view active variants for approved products" on public.product_variants;
create policy "Public can view active variants for approved products" on public.product_variants for select using (
 is_active = true and exists(select 1 from public.products p where p.id=product_id and p.status='approved')
);
drop policy if exists "Sellers can manage variants for own editable products" on public.product_variants;
create policy "Sellers can manage variants for own editable products" on public.product_variants for all to authenticated
 using(exists(select 1 from public.products p join public.shops s on s.id=p.shop_id where p.id=product_id and s.owner_id=auth.uid() and p.status in ('pending_review','rejected')))
 with check(exists(select 1 from public.products p join public.shops s on s.id=p.shop_id where p.id=product_id and s.owner_id=auth.uid() and p.status in ('pending_review','rejected')));
alter table public.order_items add column if not exists variant_id uuid references public.product_variants(id) on delete set null;
alter table public.order_items add column if not exists variant_label text;
