-- Island Express promotional campaigns
create table if not exists public.promotional_campaigns (
  id uuid primary key default gen_random_uuid(),
  eyebrow text not null default 'SPECIAL CAMPAIGN',
  title text not null check (char_length(trim(title)) between 2 and 100),
  subtitle text,
  description text,
  image_url text,
  cta_label text not null default 'Explore offers',
  cta_url text not null default '/search',
  background_style text not null default 'island' check (background_style in ('island','sunset','ocean','market')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotional_campaign_dates check (ends_at is null or ends_at > starts_at)
);
create index if not exists promotional_campaigns_active_dates_idx
  on public.promotional_campaigns(is_active, starts_at, ends_at, sort_order);
alter table public.promotional_campaigns enable row level security;
drop policy if exists "Public can view live promotional campaigns" on public.promotional_campaigns;
create policy "Public can view live promotional campaigns"
on public.promotional_campaigns for select
using (is_active = true and starts_at <= now() and (ends_at is null or ends_at > now()));
drop policy if exists "Admins can manage promotional campaigns" on public.promotional_campaigns;
create policy "Admins can manage promotional campaigns"
on public.promotional_campaigns for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));
grant select on public.promotional_campaigns to anon, authenticated;
grant insert, update, delete on public.promotional_campaigns to authenticated;
