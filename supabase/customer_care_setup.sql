-- Island Express Customer Care: AI-first support with secure human handover.
-- No customer-to-seller messaging is created by this schema.
create extension if not exists pgcrypto;

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 3 and 140),
  category text not null default 'general'
    check (category in ('general','orders','payments','delivery','returns_refunds','account','products','other')),
  status text not null default 'open'
    check (status in ('open','waiting_for_support','in_progress','resolved')),
  handoff_requested boolean not null default false,
  assigned_admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_type text not null check (sender_type in ('customer','ai','admin')),
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_customer_idx
  on public.support_conversations(customer_id, updated_at desc);
create index if not exists support_conversations_status_idx
  on public.support_conversations(status, updated_at desc);
create index if not exists support_messages_conversation_idx
  on public.support_messages(conversation_id, created_at);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

create or replace function public.is_support_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  ) and coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;

drop policy if exists "Customers and support admins view support conversations" on public.support_conversations;
create policy "Customers and support admins view support conversations"
on public.support_conversations for select to authenticated
using (customer_id = auth.uid() or public.is_support_admin());

drop policy if exists "Customers create own support conversations" on public.support_conversations;
create policy "Customers create own support conversations"
on public.support_conversations for insert to authenticated
with check (customer_id = auth.uid());

drop policy if exists "Support admins update conversations" on public.support_conversations;
create policy "Support admins update conversations"
on public.support_conversations for update to authenticated
using (public.is_support_admin())
with check (public.is_support_admin());

drop policy if exists "Conversation participants view messages" on public.support_messages;
create policy "Conversation participants view messages"
on public.support_messages for select to authenticated
using (
  public.is_support_admin()
  or exists (
    select 1 from public.support_conversations c
    where c.id = conversation_id and c.customer_id = auth.uid()
  )
);

drop policy if exists "Customers and support admins send messages" on public.support_messages;
create policy "Customers and support admins send messages"
on public.support_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and (
    (sender_type = 'admin' and public.is_support_admin())
    or (
      sender_type = 'customer'
      and exists (
        select 1 from public.support_conversations c
        where c.id = conversation_id
          and c.customer_id = auth.uid()
          and c.status in ('open','waiting_for_support','in_progress')
      )
    )
  )
);
-- AI messages are inserted only by the trusted server using the service-role key.
-- Customers cannot impersonate AI or administrators through the browser client.

grant select, insert on public.support_conversations to authenticated;
grant update (status, handoff_requested, assigned_admin_id) on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;

create or replace function public.touch_support_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.support_conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists support_message_touch_conversation on public.support_messages;
create trigger support_message_touch_conversation
after insert on public.support_messages
for each row execute function public.touch_support_conversation();
