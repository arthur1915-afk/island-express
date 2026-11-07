-- Voucher redemption and safe checkout reservations.
alter table public.orders
  add column if not exists voucher_id uuid references public.shop_vouchers(id) on delete set null,
  add column if not exists voucher_code text,
  add column if not exists discount_scr numeric(12,2) not null default 0;

create or replace function public.reserve_shop_voucher(
  p_voucher_id uuid,
  p_shop_id uuid,
  p_subtotal numeric
) returns public.shop_vouchers
language plpgsql security definer set search_path=public
as $$
declare v public.shop_vouchers%rowtype;
begin
  select * into v from public.shop_vouchers
  where id=p_voucher_id and shop_id=p_shop_id
  for update;
  if not found or not v.is_active then raise exception 'This voucher is unavailable.'; end if;
  if now()<v.starts_at or (v.ends_at is not null and now()>v.ends_at) then raise exception 'This voucher is not currently valid.'; end if;
  if p_subtotal < v.minimum_spend_scr then raise exception 'Minimum spend for this voucher is SCR %.', v.minimum_spend_scr; end if;
  if v.max_redemptions is not null and v.redemption_count>=v.max_redemptions then raise exception 'This voucher has reached its redemption limit.'; end if;
  update public.shop_vouchers set redemption_count=redemption_count+1 where id=v.id returning * into v;
  return v;
end;
$$;

create or replace function public.release_order_voucher(p_order_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_id uuid; released boolean;
begin
  -- Clear the order reference first; this makes release idempotent.
  select voucher_id into v_id from public.orders where id=p_order_id and voucher_id is not null for update;
  if v_id is not null then
    update public.orders set voucher_id=null, voucher_code=null, discount_scr=0 where id=p_order_id;
    update public.shop_vouchers set redemption_count=greatest(0,redemption_count-1) where id=v_id;
  end if;
end;
$$;

revoke all on function public.reserve_shop_voucher(uuid,uuid,numeric) from public;
revoke all on function public.release_order_voucher(uuid) from public;
grant execute on function public.reserve_shop_voucher(uuid,uuid,numeric) to service_role;
grant execute on function public.release_order_voucher(uuid) to service_role;
