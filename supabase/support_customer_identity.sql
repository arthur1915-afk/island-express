-- Store the account email alongside the customer profile for support identification.
alter table public.profiles add column if not exists email text;

-- Backfill existing account emails from Supabase Auth.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and (p.email is distinct from u.email);

-- Keep the profile email current when a user signs up or changes their email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'customer'
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_profile_email_on_auth_update on auth.users;
create trigger sync_profile_email_on_auth_update
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_profile_email();

-- Only administrators can retrieve identity details for support conversations.
create or replace function public.admin_support_customer_details(customer_ids uuid[])
returns table(id uuid, full_name text, email text, phone text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'Administrator access required';
  end if;

  return query
  select p.id, p.full_name, p.email, p.phone
  from public.profiles p
  where p.id = any(customer_ids);
end;
$$;

revoke all on function public.admin_support_customer_details(uuid[]) from public;
grant execute on function public.admin_support_customer_details(uuid[]) to authenticated;
