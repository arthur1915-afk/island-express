create table if not exists public.shop_vouchers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  code text not null,
  title text not null,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_spend_scr numeric(12,2) not null default 0 check (minimum_spend_scr >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint shop_vouchers_code_unique unique (shop_id, code),
  constraint shop_vouchers_dates_valid check (ends_at is null or ends_at > starts_at),
  constraint shop_vouchers_percentage_valid check (discount_type <> 'percentage' or discount_value <= 100)
);

alter table public.shop_vouchers enable row level security;

drop policy if exists "Sellers can view own shop vouchers" on public.shop_vouchers;
create policy "Sellers can view own shop vouchers"
on public.shop_vouchers for select to authenticated
using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = auth.uid()));

drop policy if exists "Sellers can create own shop vouchers" on public.shop_vouchers;
create policy "Sellers can create own shop vouchers"
on public.shop_vouchers for insert to authenticated
with check (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = auth.uid()));

drop policy if exists "Sellers can update own shop vouchers" on public.shop_vouchers;
create policy "Sellers can update own shop vouchers"
on public.shop_vouchers for update to authenticated
using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = auth.uid()))
with check (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = auth.uid()));

drop policy if exists "Sellers can delete own shop vouchers" on public.shop_vouchers;
create policy "Sellers can delete own shop vouchers"
on public.shop_vouchers for delete to authenticated
using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = auth.uid()));

grant select, insert, update, delete on public.shop_vouchers to authenticated;
