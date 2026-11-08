-- Account deletion requests for buyers and sellers.
-- The confirmation link is emailed by Supabase Auth. The request is only
-- completed after the signed-in user returns with the one-time token.
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  account_role text not null,
  reason text not null,
  details text,
  token_hash text,
  status text not null default 'pending' check (status in ('pending','completed','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists account_deletion_requests_user_idx
  on public.account_deletion_requests(user_id, created_at desc);
create unique index if not exists account_deletion_requests_one_pending_per_user
  on public.account_deletion_requests(user_id) where status = 'pending';

alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
