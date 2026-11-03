-- Island Express customer checkout and order storage
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null,
  phone text not null,
  email text,
  island text not null check (island in ('Mahé','Praslin','La Digue','Other')),
  delivery_address text not null,
  delivery_notes text,
  subtotal_scr numeric(12,2) not null check (subtotal_scr >= 0),
  delivery_fee_scr numeric(12,2) not null default 0 check (delivery_fee_scr >= 0),
  total_scr numeric(12,2) not null check (total_scr >= 0),
  payment_method text not null default 'cash_on_delivery',
  status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','completed','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_title text not null,
  unit_price_scr numeric(12,2) not null check (unit_price_scr >= 0),
  quantity integer not null check (quantity > 0),
  shop_name text
);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
drop policy if exists "Customers can create their own orders" on public.orders;
create policy "Customers can create their own orders" on public.orders for insert to authenticated with check (auth.uid() = customer_id);
drop policy if exists "Customers can view their own orders" on public.orders;
create policy "Customers can view their own orders" on public.orders for select to authenticated using (auth.uid() = customer_id);
drop policy if exists "Customers can add items to their own orders" on public.order_items;
create policy "Customers can add items to their own orders" on public.order_items for insert to authenticated with check (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
drop policy if exists "Customers can view items in their own orders" on public.order_items;
create policy "Customers can view items in their own orders" on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()));
