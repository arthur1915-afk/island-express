-- Island Express: authentication setup
-- Run once in Supabase SQL Editor after schema.sql.

-- Create a customer profile automatically whenever a new Auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Prevent users from assigning themselves admin or changing their own role.
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

-- Open seller registration: an authenticated user may promote their own
-- customer account to seller, but cannot choose the admin role.
create or replace function public.become_seller()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to register as a seller';
  end if;

  update public.profiles
  set role = 'seller'
  where id = auth.uid() and role = 'customer';

  if not found then
    if exists (select 1 from public.profiles where id = auth.uid() and role = 'seller') then
      return;
    end if;
    raise exception 'Profile not found or account cannot become a seller';
  end if;
end;
$$;

revoke all on function public.become_seller() from public;
grant execute on function public.become_seller() to authenticated;

-- Shop creation is restricted to seller accounts and the signed-in owner.
drop policy if exists "Owners can create shops" on public.shops;
create policy "Seller accounts can create their own shops"
on public.shops for insert to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'seller'
  )
);
