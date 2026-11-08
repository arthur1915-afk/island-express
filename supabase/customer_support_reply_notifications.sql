-- Notify a customer whenever a human Customer Care agent replies.
create or replace function public.notify_customer_support_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer uuid;
begin
  if new.sender_type <> 'admin' then
    return new;
  end if;

  select customer_id into customer
  from public.support_conversations
  where id = new.conversation_id;

  if customer is null then
    return new;
  end if;

  insert into public.notifications(user_id, order_id, notification_type, title, message)
  values (
    customer,
    null,
    'customer_support_reply',
    'Customer Care replied',
    'Island Express Customer Care has replied to your support conversation. Open Customer Care to read the message.'
  );

  return new;
end;
$$;

drop trigger if exists notify_customer_support_reply on public.support_messages;
create trigger notify_customer_support_reply
after insert on public.support_messages
for each row
execute function public.notify_customer_support_reply();

-- Ensure support reply notifications can reach the app's realtime listener.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_object then
    null;
end;
$$;
