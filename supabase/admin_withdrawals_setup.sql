-- Admin-only withdrawal review and payout processing (requires MFA AAL2).
drop policy if exists "AAL2 admins can view withdrawal requests" on public.seller_withdrawal_requests;
create policy "AAL2 admins can view withdrawal requests"
on public.seller_withdrawal_requests for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
  and (auth.jwt()->>'aal')='aal2'
);

create or replace function public.admin_process_withdrawal(target_request_id uuid, decision text, note text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  req public.seller_withdrawal_requests%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.is_admin=true
  ) or (auth.jwt()->>'aal') <> 'aal2' then
    raise exception 'Administrator MFA verification is required';
  end if;

  select * into req from public.seller_withdrawal_requests
  where id=target_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if req.status not in ('pending','processing') then
    raise exception 'This withdrawal request has already been processed';
  end if;

  if decision='paid' then
    update public.seller_withdrawal_requests
    set status='paid',processed_at=now(),admin_note=nullif(trim(note),'')
    where id=target_request_id;
    update public.seller_earnings
    set status='paid'
    where seller_id=req.seller_id and status='withdrawal_pending';
  elsif decision='rejected' then
    update public.seller_withdrawal_requests
    set status='rejected',processed_at=now(),admin_note=nullif(trim(note),'')
    where id=target_request_id;
    update public.seller_earnings
    set status='available'
    where seller_id=req.seller_id and status='withdrawal_pending';
  else
    raise exception 'Decision must be paid or rejected';
  end if;
end;
$$;
revoke all on function public.admin_process_withdrawal(uuid,text,text) from public;
grant execute on function public.admin_process_withdrawal(uuid,text,text) to authenticated;
