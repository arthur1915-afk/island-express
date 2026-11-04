-- Island Express customer profile fields and avatar storage
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists island text;
grant update (full_name, phone, avatar_url, bio, island) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-images','profile-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Users can upload own profile image" on storage.objects;
create policy "Users can upload own profile image"
on storage.objects for insert to authenticated
with check (bucket_id='profile-images' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users can update own profile image" on storage.objects;
create policy "Users can update own profile image"
on storage.objects for update to authenticated
using (bucket_id='profile-images' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='profile-images' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Public can view profile images" on storage.objects;
create policy "Public can view profile images"
on storage.objects for select
using (bucket_id='profile-images');
