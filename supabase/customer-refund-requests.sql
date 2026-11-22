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

create or replace function public.admin_decide_refund(
 target_request_id uuid,
 decision text,
 response_note text default null
) returns void
language plpgsql security definer set search_path=public
as $$
declare req public.refund_requests%rowtype;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_admin=true) then
  raise exception 'Administrator access required';
 end if;
 if decision not in ('approved','rejected') then raise exception 'Invalid refund decision'; end if;
 if decision='rejected' and length(trim(coalesce(response_note,'')))<5 then
  raise exception 'Please provide a reason when rejecting a refund request';
 end if;
 select * into req from public.refund_requests where id=target_request_id for update;
 if not found or req.status<>'pending' then raise exception 'This refund request is no longer pending'; end if;
 update public.refund_requests set status=decision,admin_note=nullif(trim(response_note),''),reviewed_by=auth.uid(),reviewed_at=now() where id=req.id;
 insert into public.notifications(user_id,order_id,notification_type,title,message)
 values(req.customer_id,req.order_id,
  case when decision='approved' then 'refund_request_approved' else 'refund_request_rejected' end,
  case when decision='approved' then 'Refund request approved' else 'Refund request not approved' end,
  case when decision='approved' then 'Your refund request has been approved. The marketplace team will follow up on the refund processing.' else 'Your refund request was not approved. Admin note: '||trim(response_note) end);
end;
$$;
revoke all on function public.admin_decide_refund(uuid,text,text) from public;
grant execute on function public.admin_decide_refund(uuid,text,text) to authenticated;
