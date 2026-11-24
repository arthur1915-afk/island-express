create table if not exists public.admin_product_import_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  source_url text not null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  stage text not null default 'Queued',
  message text not null default 'Import queued.',
  product_id uuid null references public.products(id) on delete set null,
  error text null,
  imported_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_product_import_jobs_user_created_idx
  on public.admin_product_import_jobs(imported_by, created_at desc);
alter table public.admin_product_import_jobs enable row level security;
