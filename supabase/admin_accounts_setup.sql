-- Island Express: secure administrator management
-- Run once in Supabase SQL Editor.
-- Only an existing administrator who is signed in can list or change admin access.

create or replace function public.admin_list_accounts()
returns table(user_id uuid, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'Administrator access required';
  end if;

  return query
  select u.id, u.email::text
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.is_admin = true
  order by lower(u.email);
end;
$$;

create or replace function public.admin_set_account_access(target_email text, make_admin boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_id uuid;
  admin_count integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_admin = true
  ) then
    raise exception 'Administrator access required';
  end if;

  if target_email is null or length(trim(target_email)) = 0 then
    raise exception 'Enter a valid account email';
  end if;

  select u.id into target_id
  from auth.users u
  where lower(u.email) = lower(trim(target_email))
  limit 1;

  if target_id is null then
    raise exception 'No registered Island Express account was found with that email. Ask the person to create an account first.';
  end if;

  if make_admin then
    update public.profiles set is_admin = true where id = target_id;
  else
    if target_id = auth.uid() then
      raise exception 'You cannot remove your own administrator access';
    end if;

    select count(*) into admin_count
    from public.profiles where is_admin = true;

    if admin_count <= 1 then
      raise exception 'The last administrator cannot be removed';
    end if;

    update public.profiles set is_admin = false where id = target_id;
  end if;
end;
$$;

revoke all on function public.admin_list_accounts() from public;
revoke all on function public.admin_set_account_access(text, boolean) from public;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.admin_set_account_access(text, boolean) to authenticated;
