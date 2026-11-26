// Checks supabase/push-triggers.sql in an in-process Postgres (PGlite): which saves ask for a notification, and that
// a notification problem never blocks a save. net.http_post is replaced by a recorder.
// Run: npx vite-node scripts/push-trigger-test.ts
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema extensions; create schema net; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create table calls (url text, headers jsonb, body jsonb);
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language plpgsql as $$
    begin
      if url like '%broken%' then raise exception 'network down'; end if;
      insert into calls values (url, headers, body); return 1;
    end $$;
  create table public.projects (id uuid primary key, name text default 'Project', location text default '', budget bigint, target_finish date, deleted_at bigint);
  create table public.project_members (project_id uuid, user_id uuid, display_name text, email text);
  create table public.member_permissions (project_id uuid, user_id uuid, permission text, enabled boolean);
  create table public.phases (id uuid primary key, project_id uuid, done boolean default false, budget bigint);
  create table public.transfers (id uuid primary key, project_id uuid, member_id uuid, amount bigint, kind text, deleted_at bigint);
  create table public.contracts (id uuid primary key, project_id uuid, amount bigint, status text, variations jsonb default '[]', deleted_at bigint);
  create table public.payments (
    id uuid primary key, project_id uuid default '00000000-0000-0000-0000-000000000099', approval text, amount bigint default 1,
    plan_id uuid, added_by text, deleted_at bigint, status text default 'paid', date date default current_date, purpose text default 'Test',
    vendor_id uuid, phase_id uuid, paid_by text, project_cash_amount bigint
  );
`)
// pg_net itself is not in PGlite, so the extension line is dropped; the function under test is unchanged.
const sql = readFileSync('supabase/push-triggers.sql', 'utf8')
  .replace('create extension if not exists pg_net with schema extensions;', '')
  .replaceAll('__FUNCTION_URL__', 'https://fn.example/send-reminders')
  .replaceAll('__CRON_SECRET__', 'shh')
await db.exec(sql)
await db.exec(sql) // safe to run twice

const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}`
const calls = async () => (await db.query<{ body: any }>("select body from calls where body->>'action' = 'payment-event' order by ctid")).rows.map((r) => `${r.body.event}:${r.body.payment_id.slice(-1)}`)
const activityCalls = async () => (await db.query<{ body: any }>("select body from calls where body->>'action' = 'activity-event' order by ctid")).rows.map((r) => r.body)
const reset = () => db.exec('truncate calls')

await db.exec(`insert into payments (id, approval) values ('${id(1)}', 'pending')`)
assert.deepEqual(await calls(), ['pending:1'], 'a builder entry arrives pending: the investor is told')
assert.equal((await activityCalls())[0].event, 'payment_added', 'the other members also hear about a manually added payment')
const row = (await db.query<{ url: string; headers: any }>('select url, headers from calls')).rows[0]
assert.equal(row.url, 'https://fn.example/send-reminders'); assert.equal(row.headers['x-cron-secret'], 'shh')
await reset()

await db.exec(`update payments set amount = 99 where id = '${id(1)}'`)
await db.exec(`update payments set approval = 'pending' where id = '${id(1)}'`)
assert.deepEqual(await calls(), [], 'editing a pending entry, or saving it again as pending, is silent')

await db.exec(`update payments set approval = 'rejected' where id = '${id(1)}'`)
assert.deepEqual(await calls(), ['rejected:1'], 'rejected: the builder is told'); await reset()
await db.exec(`update payments set approval = 'pending' where id = '${id(1)}'`)
assert.deepEqual(await calls(), ['pending:1'], 'sent again after a correction: the investor is told again'); await reset()
await db.exec(`update payments set approval = 'approved' where id = '${id(1)}'`)
assert.deepEqual(await calls(), ['approved:1'], 'approved: the builder is told'); await reset()
await db.exec(`update payments set approval = 'approved' where id = '${id(1)}'`)
assert.deepEqual(await calls(), [], 'a repeated save of the same state is silent')

await db.exec(`insert into payments (id, approval) values ('${id(2)}', null), ('${id(3)}', 'approved')`)
assert.deepEqual(await calls(), [], 'the investor\'s own entries, and entries inserted as approved, are silent')

// A network failure must not stop the payment from saving.
await db.exec(sql.replace('https://fn.example/send-reminders', 'https://broken.example'))
await db.exec(`insert into payments (id, approval) values ('${id(4)}', 'pending')`)
assert.equal((await db.query('select 1 from payments where id = $1', [id(4)])).rows.length, 1, 'the save went through')

console.log('push trigger: all checks passed')
process.exit(0)
