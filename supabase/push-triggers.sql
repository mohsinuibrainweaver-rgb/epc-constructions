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

-- Shared activity dispatcher. It makes one small Edge Function call for a meaningful project change; the function fans
-- that event out to the right members and devices. Routine sync timestamp updates and weekly auto-generated payments are silent.
create or replace function public.notify_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  ev text;
  pid uuid;
  rid text;
  actor uuid := auth.uid();
  subject uuid;
  subject_name text;
begin
  pid := coalesce((n ->> 'project_id')::uuid, (o ->> 'project_id')::uuid,
                  case when tg_table_name = 'projects' then coalesce((n ->> 'id')::uuid, (o ->> 'id')::uuid) end);
  rid := coalesce(n ->> 'id', o ->> 'id');

  if tg_table_name = 'payments' then
    if actor is null and coalesce(n ->> 'added_by', o ->> 'added_by', '') ~* '^[0-9a-f-]{36}$' then
      actor := coalesce(n ->> 'added_by', o ->> 'added_by')::uuid;
    end if;
    if tg_op = 'INSERT' then
      if n ->> 'plan_id' is not null then return new; end if;
      ev := 'payment_added';
    elsif (o ->> 'deleted_at') is distinct from (n ->> 'deleted_at') then
      ev := case when n ->> 'deleted_at' is null then 'payment_restored' else 'payment_deleted' end;
    elsif (o ->> 'status') is distinct from (n ->> 'status') then
      ev := case n ->> 'status' when 'skipped' then 'payment_skipped' when 'paid' then 'payment_paid' else 'payment_changed' end;
    elsif (o ->> 'date') is distinct from (n ->> 'date') then ev := 'payment_rescheduled';
    elsif (o ->> 'amount', o ->> 'purpose', o ->> 'vendor_id', o ->> 'phase_id', o ->> 'paid_by', o ->> 'project_cash_amount')
       is distinct from (n ->> 'amount', n ->> 'purpose', n ->> 'vendor_id', n ->> 'phase_id', n ->> 'paid_by', n ->> 'project_cash_amount') then
      ev := 'payment_changed';
    end if;
  elsif tg_table_name = 'phases' and tg_op = 'UPDATE' then
    if (o ->> 'done') is distinct from (n ->> 'done') then ev := case when (n ->> 'done')::boolean then 'phase_completed' else 'phase_reopened' end;
    elsif (o ->> 'budget') is distinct from (n ->> 'budget') then ev := 'phase_estimate_changed'; end if;
  elsif tg_table_name = 'transfers' then
    subject := nullif(coalesce(n ->> 'member_id', o ->> 'member_id'), '')::uuid;
    if tg_op = 'INSERT' then ev := 'cash_added';
    elsif (o ->> 'deleted_at') is distinct from (n ->> 'deleted_at') and n ->> 'deleted_at' is not null then ev := 'cash_deleted';
    elsif (o ->> 'amount', o ->> 'kind', o ->> 'member_id') is distinct from (n ->> 'amount', n ->> 'kind', n ->> 'member_id') then ev := 'cash_changed'; end if;
  elsif tg_table_name = 'contracts' then
    if tg_op = 'INSERT' then ev := 'contract_created';
    elsif (o ->> 'deleted_at') is distinct from (n ->> 'deleted_at') then ev := case when n ->> 'deleted_at' is null then 'contract_restored' else 'contract_deleted' end;
    elsif (o ->> 'status') is distinct from (n ->> 'status') then
      ev := case n ->> 'status' when 'completed' then 'contract_completed' when 'cancelled' then 'contract_cancelled' else 'contract_changed' end;
    elsif (o ->> 'amount', o -> 'variations') is distinct from (n ->> 'amount', n -> 'variations') then ev := 'contract_changed'; end if;
  elsif tg_table_name = 'project_members' then
    subject := coalesce((n ->> 'user_id')::uuid, (o ->> 'user_id')::uuid);
    subject_name := coalesce(n ->> 'display_name', o ->> 'display_name', n ->> 'email', o ->> 'email');
    ev := case tg_op when 'INSERT' then 'member_joined' when 'DELETE' then 'member_removed' end;
  elsif tg_table_name = 'member_permissions' and tg_op = 'UPDATE' and (o ->> 'enabled') is distinct from (n ->> 'enabled') then
    subject := (n ->> 'user_id')::uuid; ev := 'permissions_changed'; rid := n ->> 'user_id';
  elsif tg_table_name = 'projects' and tg_op = 'UPDATE' then
    if (o ->> 'deleted_at') is distinct from (n ->> 'deleted_at') and n ->> 'deleted_at' is not null then ev := 'project_deleted';
    elsif (o ->> 'budget') is distinct from (n ->> 'budget') then ev := 'project_budget_changed';
    elsif (o ->> 'name', o ->> 'location', o ->> 'target_finish') is distinct from (n ->> 'name', n ->> 'location', n ->> 'target_finish') then ev := 'project_changed'; end if;
  end if;

  if ev is not null and pid is not null then
    begin
      perform net.http_post(
        url := '__FUNCTION_URL__',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '__CRON_SECRET__'),
        body := jsonb_build_object('action', 'activity-event', 'event', ev, 'project_id', pid, 'record_id', rid,
                                   'actor_id', actor, 'subject_id', subject, 'subject_name', subject_name)
      );
    exception when others then null;
    end;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.notify_project_activity() from public, anon, authenticated;

drop trigger if exists payments_notify_activity on public.payments;
create trigger payments_notify_activity after insert or update on public.payments for each row execute function public.notify_project_activity();
drop trigger if exists phases_notify_activity on public.phases;
create trigger phases_notify_activity after update on public.phases for each row execute function public.notify_project_activity();
drop trigger if exists transfers_notify_activity on public.transfers;
create trigger transfers_notify_activity after insert or update on public.transfers for each row execute function public.notify_project_activity();
drop trigger if exists contracts_notify_activity on public.contracts;
create trigger contracts_notify_activity after insert or update on public.contracts for each row execute function public.notify_project_activity();
drop trigger if exists members_notify_activity on public.project_members;
create trigger members_notify_activity after insert or delete on public.project_members for each row execute function public.notify_project_activity();
drop trigger if exists member_permissions_notify_activity on public.member_permissions;
create trigger member_permissions_notify_activity after update of enabled on public.member_permissions for each row execute function public.notify_project_activity();
drop trigger if exists projects_notify_activity on public.projects;
create trigger projects_notify_activity after update on public.projects for each row execute function public.notify_project_activity();
