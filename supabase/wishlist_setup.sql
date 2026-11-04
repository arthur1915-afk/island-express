-- Island Express: customer wishlist / favourites
create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint wishlists_user_product_unique unique (user_id, product_id)
);

create index if not exists wishlists_user_id_created_at_idx
  on public.wishlists(user_id, created_at desc);
create index if not exists wishlists_product_id_idx
  on public.wishlists(product_id);

alter table public.wishlists enable row level security;

drop policy if exists "Customers can view their own wishlist" on public.wishlists;
create policy "Customers can view their own wishlist"
  on public.wishlists for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Customers can add to their own wishlist" on public.wishlists;
create policy "Customers can add to their own wishlist"
  on public.wishlists for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.status = 'approved'
    )
  );

drop policy if exists "Customers can remove from their own wishlist" on public.wishlists;
create policy "Customers can remove from their own wishlist"
  on public.wishlists for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.wishlists to authenticated;
