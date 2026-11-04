-- Island Express verified product reviews
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text not null check (char_length(trim(body)) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, customer_id),
  unique (order_id, product_id, customer_id)
);

create index if not exists product_reviews_product_status_idx
  on public.product_reviews(product_id, status, created_at desc);
create index if not exists product_reviews_customer_idx
  on public.product_reviews(customer_id, created_at desc);

alter table public.product_reviews enable row level security;

drop policy if exists "Public can view approved product reviews" on public.product_reviews;
create policy "Public can view approved product reviews"
on public.product_reviews for select
using (status = 'approved');

drop policy if exists "Customers can view their own product reviews" on public.product_reviews;
create policy "Customers can view their own product reviews"
on public.product_reviews for select to authenticated
using (customer_id = auth.uid());

drop policy if exists "Verified buyers can submit product reviews" on public.product_reviews;
create policy "Verified buyers can submit product reviews"
on public.product_reviews for insert to authenticated
with check (
  customer_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = order_id
      and o.customer_id = auth.uid()
      and o.status = 'completed'
      and oi.product_id = product_id
  )
);

drop policy if exists "Customers can edit their pending reviews" on public.product_reviews;
create policy "Customers can edit their pending reviews"
on public.product_reviews for update to authenticated
using (customer_id = auth.uid() and status = 'pending')
with check (
  customer_id = auth.uid()
  and status = 'pending'
  and exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.id = order_id
      and o.customer_id = auth.uid()
      and o.status = 'completed'
      and oi.product_id = product_id
  )
);

drop policy if exists "AAL2 admins can moderate product reviews" on public.product_reviews;
create policy "AAL2 admins can moderate product reviews"
on public.product_reviews for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
  and (auth.jwt()->>'aal') = 'aal2'
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  )
  and (auth.jwt()->>'aal') = 'aal2'
);

grant select, insert, update on public.product_reviews to authenticated;
grant select on public.product_reviews to anon;
