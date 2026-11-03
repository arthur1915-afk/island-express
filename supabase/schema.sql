create extension if not exists pgcrypto;
create type public.user_role as enum ('customer','seller','admin');
create type public.product_status as enum ('pending_review','approved','rejected','blocked');
create type public.moderation_outcome as enum ('approved','manual_review','rejected','blocked');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, full_name text, phone text, avatar_url text, role public.user_role not null default 'customer', created_at timestamptz not null default now());
create table public.shops (id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade, name text not null, slug text not null unique, description text, logo_url text, banner_url text, island text, is_active boolean not null default true, created_at timestamptz not null default now());
create table public.products (id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade, title text not null, description text, category text not null, price_scr numeric(12,2) not null check(price_scr>=0), stock_quantity integer not null default 0 check(stock_quantity>=0), image_urls text[] not null default '{}', status public.product_status not null default 'pending_review', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.product_moderation (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, outcome public.moderation_outcome not null, risk_score numeric(5,2) check(risk_score between 0 and 100), flags jsonb not null default '[]'::jsonb, explanation text, model_name text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, created_at timestamptz not null default now());
create table public.product_reports (id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade, reporter_id uuid references public.profiles(id), reason text not null, details text, status text not null default 'open', created_at timestamptz not null default now());
create index products_shop_id_idx on public.products(shop_id); create index products_status_idx on public.products(status); create index shops_owner_id_idx on public.shops(owner_id); create index moderation_product_id_idx on public.product_moderation(product_id);

alter table public.profiles enable row level security; alter table public.shops enable row level security; alter table public.products enable row level security; alter table public.product_moderation enable row level security; alter table public.product_reports enable row level security;
create policy "Users can view own profile" on public.profiles for select to authenticated using(auth.uid()=id);
create policy "Users can create own profile" on public.profiles for insert to authenticated with check(auth.uid()=id);
create policy "Users can update own profile" on public.profiles for update to authenticated using(auth.uid()=id) with check(auth.uid()=id);
create policy "Public can view active shops" on public.shops for select using(is_active=true);
create policy "Owners can view their shops" on public.shops for select to authenticated using(auth.uid()=owner_id);
create policy "Owners can create shops" on public.shops for insert to authenticated with check(auth.uid()=owner_id);
create policy "Owners can update shops" on public.shops for update to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
create policy "Public can view approved products" on public.products for select using(status='approved');
create policy "Owners can view their products" on public.products for select to authenticated using(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));
create policy "Owners can create products pending review" on public.products for insert to authenticated with check(exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()) and status='pending_review');
create policy "Owners can update pending or rejected products" on public.products for update to authenticated using(status in ('pending_review','rejected') and exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid())) with check(status in ('pending_review','rejected') and exists(select 1 from public.shops s where s.id=shop_id and s.owner_id=auth.uid()));
-- Moderation records are server/admin-managed. Do not grant sellers permission to approve their own listings.
