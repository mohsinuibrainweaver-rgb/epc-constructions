-- Instant notifications for the approval flow. Run once in the Supabase SQL Editor AFTER schema.sql and after the
-- send-reminders function is deployed. Replace the two placeholders in the code below (docs/PUSH_SETUP.md shows how):
--   the URL placeholder    https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders
--   the secret placeholder the same value as the CRON_SECRET secret of the function
-- Safe to run again.
--
-- When an entry becomes 'pending' (the builder submitted it), the investor is told. When it becomes 'approved' or
-- 'rejected', the builder is told. A failure to notify never blocks saving a payment.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_approval_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ev text;
begin
  if new.approval = 'pending' and (tg_op = 'INSERT' or old.approval is distinct from 'pending') then
    ev := 'pending';
  elsif new.approval in ('approved', 'rejected') and tg_op = 'UPDATE' and old.approval is distinct from new.approval then
    ev := new.approval;
  end if;

  if ev is not null then
    begin
      perform net.http_post(
        url := '__FUNCTION_URL__',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '__CRON_SECRET__'),
        body := jsonb_build_object('action', 'payment-event', 'event', ev, 'payment_id', new.id)
      );
    exception when others then
      null; -- never block the write
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_approval_event() from public, anon, authenticated;

drop trigger if exists payments_notify_approval on public.payments;
create trigger payments_notify_approval
  after insert or update of approval on public.payments
  for each row execute function public.notify_approval_event();
