-- Customer refund requests with private photo/video evidence.
create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (length(trim(reason)) >= 20),
  photo_path text not null,
  video_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(order_id)
);
create index if not exists refund_requests_status_created_idx on public.refund_requests(status,created_at desc);
alter table public.refund_requests enable row level security;
drop policy if exists "Customers view own refund requests" on public.refund_requests;
create policy "Customers view own refund requests" on public.refund_requests for select to authenticated using (customer_id=auth.uid());
drop policy if exists "Customers submit eligible refund requests" on public.refund_requests;
create policy "Customers submit eligible refund requests" on public.refund_requests for insert to authenticated with check (
  customer_id=auth.uid()
  and exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid() and o.payment_status='paid' and o.status not in ('cancelled','pending'))
);
drop policy if exists "Admins view refund requests" on public.refund_requests;
create policy "Admins view refund requests" on public.refund_requests for select to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));
drop policy if exists "Admins update refund requests" on public.refund_requests;
create policy "Admins update refund requests" on public.refund_requests for update to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)) with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('refund-evidence','refund-evidence',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Customers upload own refund evidence" on storage.objects;
create policy "Customers upload own refund evidence" on storage.objects for insert to authenticated with check (
 bucket_id='refund-evidence'
 and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.orders o where o.id=((storage.foldername(name))[2])::uuid and o.customer_id=auth.uid() and o.payment_status='paid' and o.status not in ('cancelled','pending'))
);
drop policy if exists "Customers and admins view refund evidence" on storage.objects;
create policy "Customers and admins view refund evidence" on storage.objects for select to authenticated using (
 bucket_id='refund-evidence'
 and (
  (storage.foldername(name))[1]=auth.uid()::text
  or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
 )
);
revoke all on public.refund_requests from anon;
grant select,insert on public.refund_requests to authenticated;
grant update(status,admin_note,reviewed_by,reviewed_at) on public.refund_requests to authenticated;
