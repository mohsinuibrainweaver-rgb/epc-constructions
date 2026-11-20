-- EPC Construction: database schema for Supabase.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.
-- It is safe to run more than once.
--
-- Model: every row belongs to a project. A person can read and write a project's rows only
-- when they are a member of that project (project_members). Times are client milliseconds
-- (bigint); server_updated_at is the server clock and drives incremental pulls.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- projects
create table if not exists public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  location text not null default '',
  plot_size text,
  covered_area integer,
  floors integer,
  start_date date,
  target_finish date,
  budget bigint,
  currency text not null default 'PKR',
  type text not null default 'house',
  thumbnail_path text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'investor' check (role in ('investor', 'builder')),
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role text not null default 'builder' check (role in ('investor', 'builder')),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists project_invites_unique
  on public.project_invites (project_id, lower(email)) where accepted_at is null;

-- Soft references (no foreign keys) so rows can arrive in any order during a sync.
create table if not exists public.phases (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  key text,
  name text,
  sort_order integer not null default 0,
  budget bigint,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  role text not null default 'other',
  phone text,
  bank_account text,
  notes text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  amount bigint not null,
  vendor_id uuid,
  payee_name text,
  phase_id uuid,
  category text not null,
  misc_type text,
  purpose text not null,
  status text not null,
  mode text not null,
  paid_by text not null,
  note text,
  added_by text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  payment_id uuid not null,
  name text,
  path text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------- money features
-- Added after the first release. Safe to run on a project that already has the older tables.
-- Approval of the builder's entries (added after the first release).
alter table public.payments add column if not exists approval text check (approval in ('pending', 'approved', 'rejected'));
alter table public.payments add column if not exists approved_by text;
alter table public.payments add column if not exists approved_at bigint;
alter table public.payments add column if not exists reject_reason text;

-- Fee per phase and monthly retainer (added after the first release).
alter table public.projects add column if not exists retainer_amount bigint;
alter table public.projects add column if not exists retainer_start date;
alter table public.projects add column if not exists retainer_end date;
alter table public.phases add column if not exists fee_kind text check (fee_kind in ('fixed', 'percent'));
alter table public.phases add column if not exists fee_value numeric;
alter table public.phases add column if not exists done boolean not null default false;

alter table public.projects add column if not exists fee_basis text not null default 'tbd';
alter table public.projects add column if not exists fee_amount bigint;
alter table public.projects add column if not exists fee_percent numeric;
alter table public.payments add column if not exists plan_id uuid;

create table if not exists public.payment_plans (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  vendor_id uuid,
  phase_id uuid,
  purpose text not null,
  amount bigint not null,
  weekday smallint not null check (weekday between 0 and 6),
  category text not null default 'labour',
  mode text not null default 'cash',
  paid_by text not null default 'investor',
  start_date date not null,
  generated_through date,
  active boolean not null default true,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.transfers (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  amount bigint not null,
  kind text not null check (kind in ('advance', 'topup', 'reimbursement', 'return', 'fee')),
  note text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  item text not null,
  quantity numeric not null,
  unit text not null default 'piece',
  rate numeric not null,
  amount bigint not null,
  supplier text,
  phase_id uuid,
  payment_id uuid,
  note text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create index if not exists materials_project on public.materials (project_id, server_updated_at);

create table if not exists public.project_files (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('document', 'photo')),
  title text not null,
  doc_type text,
  phase_id uuid,
  date date not null,
  note text,
  name text,
  mime text,
  size bigint,
  path text,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create index if not exists project_files_project on public.project_files (project_id, server_updated_at);

create table if not exists public.contracts (
  id uuid primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  vendor_id uuid,
  phase_id uuid,
  amount bigint not null,
  date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  note text,
  variations jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default now()
);

create index if not exists contracts_project on public.contracts (project_id, server_updated_at);

alter table public.payments add column if not exists contract_id uuid;

-- Bank details of a transfer (added after the first release): the bank, the account number or IBAN, and the reference.
-- Safe to run on a project that already has the older tables; nothing is removed or changed.
alter table public.payments add column if not exists bank_name text;
alter table public.payments add column if not exists bank_account text;
alter table public.payments add column if not exists bank_ref text;
alter table public.vendors add column if not exists bank_name text;

create index if not exists payment_plans_project on public.payment_plans (project_id, server_updated_at);
create index if not exists transfers_project on public.transfers (project_id, server_updated_at);

create index if not exists phases_project on public.phases (project_id, server_updated_at);
create index if not exists vendors_project on public.vendors (project_id, server_updated_at);
create index if not exists payments_project on public.payments (project_id, server_updated_at);
create index if not exists attachments_project on public.attachments (project_id, server_updated_at);
create index if not exists projects_updated on public.projects (server_updated_at);

-- ------------------------------------------------------------------ helpers
create or replace function public.is_member(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.user_id = auth.uid()
  );
$$;

-- Last write wins by the client's updated_at; the server clock is stamped on every accepted write.
create or replace function public.sync_stamp()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- an older edit arrived late: ignore it
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['projects', 'phases', 'vendors', 'payments', 'attachments', 'payment_plans', 'transfers', 'materials', 'project_files', 'contracts'] loop
    execute format('drop trigger if exists %I_stamp on public.%I', t, t);
    execute format(
      'create trigger %I_stamp before insert or update on public.%I for each row execute function public.sync_stamp()',
      t, t
    );
  end loop;
end $$;

-- The creator of a project becomes its first member.
create or replace function public.add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role, email)
  values (new.id, new.owner_id, 'investor', auth.jwt() ->> 'email')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists projects_owner_member on public.projects;
create trigger projects_owner_member after insert on public.projects
for each row execute function public.add_owner_member();

-- Called by the app after sign-in: turns invitations sent to this email into memberships.
create or replace function public.claim_invites()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed integer := 0;
  r record;
begin
  for r in
    select * from public.project_invites
    where accepted_at is null and lower(email) = lower(auth.jwt() ->> 'email')
  loop
    insert into public.project_members (project_id, user_id, role, email)
    values (r.project_id, auth.uid(), r.role, auth.jwt() ->> 'email')
    on conflict do nothing;
    update public.project_invites set accepted_at = now() where id = r.id;
    claimed := claimed + 1;
  end loop;
  return claimed;
end;
$$;

grant execute on function public.claim_invites() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;

-- --------------------------------------------------------- row level security
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.phases enable row level security;
alter table public.vendors enable row level security;
alter table public.payments enable row level security;
alter table public.attachments enable row level security;
alter table public.payment_plans enable row level security;
alter table public.transfers enable row level security;
alter table public.materials enable row level security;
alter table public.project_files enable row level security;
alter table public.contracts enable row level security;

drop policy if exists projects_select on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (public.is_member(id) or owner_id = auth.uid());
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists members_select on public.project_members;
drop policy if exists members_update_self on public.project_members;
create policy members_select on public.project_members for select to authenticated
  using (public.is_member(project_id));
create policy members_update_self on public.project_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists invites_all on public.project_invites;
create policy invites_all on public.project_invites for all to authenticated
  using (public.is_member(project_id)) with check (public.is_member(project_id));

do $$
declare t text;
begin
  foreach t in array array['phases', 'vendors', 'payments', 'attachments', 'payment_plans', 'transfers', 'materials', 'project_files', 'contracts'] loop
    execute format('drop policy if exists %I_all on public.%I', t, t);
    execute format(
      'create policy %I_all on public.%I for all to authenticated using (public.is_member(project_id)) with check (public.is_member(project_id))',
      t, t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------- storage
-- One private bucket for receipt photos and project thumbnails.
-- Files live under <project id>/..., and only members of that project can touch them.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_select on storage.objects;
drop policy if exists receipts_insert on storage.objects;
drop policy if exists receipts_update on storage.objects;
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.is_member(((storage.foldername(name))[1])::uuid));

-- ------------------------------------------------------------ push notifications
-- One row per device that turned notifications on. The reminder function (service role) reads these;
-- a person can only see and change their own devices.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  lang text not null default 'en' check (lang in ('en', 'ur')),
  created_at timestamptz not null default now()
);
-- What this device wants to hear about (due, budget80, budget100, approvalRequests, approvalDecisions: true or
-- false; a missing key means yes) and the hour it wants the daily reminders, in Pakistan time.
alter table public.push_subscriptions add column if not exists prefs jsonb not null default '{}'::jsonb;
alter table public.push_subscriptions add column if not exists reminder_hour smallint not null default 9
  check (reminder_hour between 0 and 23);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Remembers which one-time alerts were sent (a budget reaching 80 or 100 percent), so each goes out once.
-- Only the service role touches it: row level security on, no policies.
create table if not exists public.push_log (
  project_id uuid not null references public.projects (id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (project_id, key)
);
alter table public.push_log enable row level security;

-- ---------------------------------------------------------------- realtime
do $$
declare t text;
begin
  foreach t in array array['projects', 'phases', 'vendors', 'payments', 'attachments', 'payment_plans', 'transfers', 'materials', 'project_files', 'contracts', 'project_members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
