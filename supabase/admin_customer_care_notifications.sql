-- Notify every Island Express administrator when a customer sends a message to Customer Care.
-- Run once in Supabase SQL Editor.

create or replace function public.notify_admin_customer_care_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_subject text;
begin
  -- Only customer messages should alert administrators; ignore AI and admin replies.
  if new.sender_type <> 'customer' then
    return new;
  end if;

  select subject
    into conversation_subject
  from public.support_conversations
  where id = new.conversation_id;

  insert into public.notifications(user_id, notification_type, title, message)
  select
    p.id,
    'admin_customer_care_message',
    'New Customer Care message',
    'A customer sent a message about "' ||
      coalesce(conversation_subject, 'Customer Care request') ||
      '". Open the Customer Care Inbox to respond.'
  from public.profiles p
  where p.is_admin = true;

  return new;
end;
$$;

drop trigger if exists notify_admin_customer_care_message on public.support_messages;
create trigger notify_admin_customer_care_message
after insert on public.support_messages
for each row
execute function public.notify_admin_customer_care_message();

-- Keep admin notification badges and live updates in sync.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
