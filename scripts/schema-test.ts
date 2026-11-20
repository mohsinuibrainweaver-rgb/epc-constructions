// Validates supabase/schema.sql in an in-process Postgres (PGlite): runs it twice, upgrades an "old" database,
// and checks the access rules for the money tables. Run: npx vite-node scripts/schema-test.ts
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const stubs = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif((coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb) ->> 'sub', '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
grant usage on schema public, auth, storage to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
grant select, insert, update on storage.objects to authenticated;
`
// pgcrypto is only needed on very old Postgres; PGlite does not ship it (gen_random_uuid is built in).
const schema = readFileSync('supabase/schema.sql', 'utf8').replace('create extension if not exists pgcrypto;', '')
const db = new PGlite()
await db.exec(stubs)

await db.exec(schema)
console.log('schema run 1 ok')
await db.exec(schema)
console.log('schema run 2 ok (idempotent)')

// An older project: the money tables and columns do not exist yet. The updated file must upgrade it in place.
await db.exec(`
  drop table public.payment_plans, public.transfers, public.materials, public.project_files, public.push_subscriptions, public.push_log, public.contracts;
  alter table public.projects drop column fee_basis, drop column fee_amount, drop column fee_percent, drop column retainer_amount, drop column retainer_start, drop column retainer_end;
  alter table public.phases drop column fee_kind, drop column fee_value, drop column done;
  alter table public.payments drop column plan_id, drop column approval, drop column approved_by, drop column approved_at, drop column reject_reason, drop column contract_id, drop column bank_name, drop column bank_account, drop column bank_ref;
  alter table public.vendors drop column bank_name;
`)
await db.exec(schema)
console.log('upgrade from the old schema ok')
await db.exec('grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;')

const A = 'aaaaaaaa-0000-0000-0000-000000000001', B = 'bbbbbbbb-0000-0000-0000-000000000002', C = 'cccccccc-0000-0000-0000-000000000003'
const P = '11111111-1111-1111-1111-111111111111'
await db.exec(`insert into auth.users values ('${A}','a@x.com'),('${B}','b@x.com'),('${C}','c@x.com')`)
const as = async (id: string, email: string) => {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${id}","email":"${email}"}', false); set role authenticated`)
}
const count = async (table: string) => Number((await db.query<{ n: string }>(`select count(*)::int as n from public.${table}`)).rows[0].n)

await as(A, 'a@x.com')
await db.exec(`insert into projects (id, owner_id, name, created_at, updated_at, fee_basis, fee_percent) values ('${P}','${A}','House 3',1,1,'percent',5)`)
await db.exec(`insert into payment_plans (id, project_id, purpose, amount, weekday, start_date, created_at, updated_at) values ('22222222-2222-2222-2222-222222222222','${P}','Foreman',90000,4,'2026-11-10',1,1)`)
await db.exec(`insert into transfers (id, project_id, date, amount, kind, created_at, updated_at) values ('33333333-3333-3333-3333-333333333333','${P}','2026-11-08',500000,'advance',1,1)`)
await db.exec(`insert into payments (id, project_id, date, amount, category, purpose, status, mode, paid_by, plan_id, created_at, updated_at) values ('44444444-4444-4444-4444-444444444444','${P}','2026-11-19',90000,'labour','Foreman','planned','cash','investor','22222222-2222-2222-2222-222222222222',1,1)`)
assert.equal(await count('payment_plans'), 1); assert.equal(await count('transfers'), 1)
await db.exec(`insert into materials (id, project_id, date, item, quantity, unit, rate, amount, created_at, updated_at) values ('88888888-8888-8888-8888-888888888888','${P}','2026-11-08','Bricks',1000,'piece',16.5,16500,1,1)`)
assert.equal(await count('materials'), 1)
await db.exec(`insert into project_files (id, project_id, kind, title, doc_type, date, name, mime, size, path, created_at, updated_at) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','${P}','document','Contract','contract','2026-11-08','contract.pdf','application/pdf',1000,'${P}/files/x.pdf',1,1)`)
await assert.rejects(db.exec(`insert into project_files (id, project_id, kind, title, date, created_at, updated_at) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','${P}','video','x','2026-11-08',1,1)`), /./)
assert.equal(await count('project_files'), 1)
// Approval columns: a pending entry is stored with its fields; anything but the three states is refused.
await db.exec(`insert into payments (id, project_id, date, amount, category, purpose, status, mode, paid_by, approval, approved_by, approved_at, reject_reason, created_at, updated_at) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','${P}','2026-11-08',500,'material','Builder entry','paid','cash','builder','rejected','A',5,'wrong amount',1,1)`)
await assert.rejects(db.exec(`insert into payments (id, project_id, date, amount, category, purpose, status, mode, paid_by, approval, created_at, updated_at) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','${P}','2026-11-08',1,'material','x','paid','cash','builder','maybe',1,1)`), /./)
// Contracts: variations are stored as JSON; a payment can point at a contract; only members see them.
await db.exec(`insert into contracts (id, project_id, title, amount, date, variations, created_at, updated_at) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','${P}','Grey structure labour',2500000,'2026-11-01','[{"id":"v1","title":"Extra room","amount":300000,"date":"2026-11-05"}]',1,1)`)
await db.exec(`update payments set contract_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`)
assert.equal(await count('contracts'), 1)
assert.equal((await db.query<{ n: number }>(`select jsonb_array_length(variations) as n from contracts`)).rows[0].n, 1)
await assert.rejects(db.exec(`insert into contracts (id, project_id, title, amount, date, status, created_at, updated_at) values ('ffffffff-ffff-ffff-ffff-ffffffffffff','${P}','x',1,'2026-11-01','paused',1,1)`), /./)
// Fee per phase and retainer columns.
await db.exec(`insert into phases (id, project_id, name, sort_order, created_at, updated_at) values ('12121212-1212-1212-1212-121212121212','${P}','Grey structure',4,1,1)`)
await db.exec(`update phases set fee_kind = 'percent', fee_value = 7.5, done = true where id = '12121212-1212-1212-1212-121212121212'`)
await assert.rejects(db.exec(`update phases set fee_kind = 'weekly' where id = '12121212-1212-1212-1212-121212121212'`), /./)
assert.equal((await db.query<{ done: boolean }>(`select done from phases where id = '12121212-1212-1212-1212-121212121212'`)).rows[0].done, true)
assert.equal((await db.query<{ done: boolean }>(`select done from phases where fee_kind is null limit 1`)).rows.length, 0, 'only the phase we gave a fee has one')
await db.exec(`update projects set fee_basis = 'retainer', retainer_amount = 100000, retainer_start = '2026-11-01' where id = '${P}'`)
await db.exec(`insert into project_invites (project_id, role) values ('${P}','builder')`)
const inviteCode = (await db.query<{ code: string }>('select code from project_invites')).rows[0].code

await as(B, 'b@x.com')
assert.equal(await count('transfers'), 0, 'B sees nothing before joining')
await db.exec(`select join_project('${inviteCode}')`)
assert.equal(await count('transfers'), 1); assert.equal(await count('payment_plans'), 1); assert.equal(await count('payments'), 2); assert.equal(await count('materials'), 1, 'B sees the material line'); assert.equal(await count('project_files'), 1, 'B sees the file row'); assert.equal(await count('contracts'), 1, 'B sees the contract')
// A builder cannot add a transfer: the write is ignored (see scripts/roles-test.ts for the rest of the role rules).
await db.exec(`insert into transfers (id, project_id, date, amount, kind, created_at, updated_at) values ('55555555-5555-5555-5555-555555555555','${P}','2026-11-09',25000,'fee',2,2)`)
assert.equal(await count('transfers'), 1, 'the builder\'s transfer was ignored')

await as(C, 'c@x.com')
assert.equal(await count('transfers'), 0); assert.equal(await count('payment_plans'), 0); assert.equal(await count('materials'), 0, 'stranger sees no materials'); assert.equal(await count('project_files'), 0, 'stranger sees no files'); assert.equal(await count('contracts'), 0, 'stranger sees no contracts')
await assert.rejects(db.exec(`insert into contracts (id, project_id, title, amount, date, created_at, updated_at) values ('99999999-0000-0000-0000-000000000009','${P}','x',1,'2026-11-01',3,3)`), /row-level security/)
await assert.rejects(db.exec(`insert into materials (id, project_id, date, item, quantity, unit, rate, amount, created_at, updated_at) values ('99999999-9999-9999-9999-999999999999','${P}','2026-11-09','x',1,'bag',1,1,3,3)`), /row-level security/)
await assert.rejects(db.exec(`insert into transfers (id, project_id, date, amount, kind, created_at, updated_at) values ('66666666-6666-6666-6666-666666666666','${P}','2026-11-09',1,'fee',3,3)`), /row-level security/)
await assert.rejects(db.exec(`insert into transfers (id, project_id, date, amount, kind, created_at, updated_at) values ('77777777-7777-7777-7777-777777777777','${P}','2026-11-09',1,'gift',3,3)`), /./)

await as(A, 'a@x.com')
assert.equal(await count('transfers'), 1, 'A sees only the transfer A added')

// Push subscriptions: each person sees and changes only their own devices; the log is for the server only.
await db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, lang) values ('${A}','https://push.example/a','k','a','ur')`)
assert.equal(await count('push_subscriptions'), 1)
await as(B, 'b@x.com')
assert.equal(await count('push_subscriptions'), 0, 'B cannot see A\'s device')
await assert.rejects(db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${A}','https://push.example/spoof','k','a')`), /row-level security/)
await db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('${B}','https://push.example/b','k','a')`)
await assert.rejects(db.exec(`insert into push_subscriptions (user_id, endpoint, p256dh, auth, lang) values ('${B}','https://push.example/c','k','a','fr')`), /./)
assert.equal(await count('push_log'), 0, 'push_log is closed to members')
await as(A, 'a@x.com')
assert.equal(await count('push_subscriptions'), 1, 'A still sees only their own')
console.log('push tables: access rules ok')

// What a device wants (prefs) and its reminder hour: defaults, own device only, hour in range.
const mine = async () => (await db.query<{ prefs: any; reminder_hour: number }>('select prefs, reminder_hour from push_subscriptions')).rows
assert.deepEqual((await mine())[0], { prefs: {}, reminder_hour: 9 }, 'a new device gets everything at 9:00')
await db.exec(`update push_subscriptions set prefs = '{"due": false, "budget80": false}'::jsonb, reminder_hour = 7`)
assert.deepEqual((await mine())[0], { prefs: { due: false, budget80: false }, reminder_hour: 7 })
await assert.rejects(db.exec(`update push_subscriptions set reminder_hour = 24`), /./, 'hour 24 does not exist')
await assert.rejects(db.exec(`update push_subscriptions set reminder_hour = -1`), /./)
await db.exec(`update push_subscriptions set reminder_hour = 0`)
await as(B, 'b@x.com')
assert.deepEqual((await mine())[0], { prefs: {}, reminder_hour: 9 }, 'B\'s device is not touched by A\'s choices')
await db.exec(`update push_subscriptions set reminder_hour = 22 where endpoint = 'https://push.example/a'`) // not B's: changes nothing
await as(A, 'a@x.com')
assert.equal((await mine())[0].reminder_hour, 0, 'B cannot change A\'s device')
console.log('push preferences: ok')

// Bank details of a transfer: stored on the payment and the vendor, empty by default, and only members see them.
await as(A, 'a@x.com')
await db.exec(`update payments set bank_name = 'HBL', bank_account = 'PK36HABB0000001123456702', bank_ref = 'TXN-1' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`)
await db.exec(`insert into vendors (id, project_id, name, bank_account, bank_name, created_at, updated_at) values ('30303030-3030-3030-3030-303030303030','${P}','Ihtisham','0123456789','Meezan Bank',1,1)`)
const bank = (await db.query<{ bank_name: string; bank_account: string; bank_ref: string }>(`select bank_name, bank_account, bank_ref from payments where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'`)).rows[0]
assert.deepEqual([bank.bank_name, bank.bank_account, bank.bank_ref], ['HBL', 'PK36HABB0000001123456702', 'TXN-1'])
assert.equal((await db.query<{ bank_name: string | null }>(`select bank_name from payments where id = '44444444-4444-4444-4444-444444444444'`)).rows[0].bank_name, null, 'a payment without bank details has none')
await as(C, 'c@x.com')
assert.equal((await db.query(`select 1 from vendors where bank_name is not null`)).rows.length, 0, 'a stranger sees no vendor bank details')
await as(A, 'a@x.com')
console.log('bank details columns: ok')

// Last edit wins, and the server says which rows it really wrote. The sync engine relies on this to notice an edit
// that a newer one replaced (a row missing from the answer was refused), so it must keep holding.
await as(A, 'a@x.com')
const R = '10101010-1010-1010-1010-101010101010'
const upsert = async (amount: number, at: number) =>
  (await db.query<{ id: string }>(
    `insert into payments (id, project_id, date, amount, category, purpose, status, mode, paid_by, created_at, updated_at)
     values ('${R}','${P}','2026-11-19',${amount},'labour','Ceiling','paid','bank','investor',1,${at})
     on conflict (id) do update set amount = excluded.amount, updated_at = excluded.updated_at returning id`,
  )).rows
assert.equal((await upsert(100, 10)).length, 1, 'a new row is reported as written')
assert.equal((await upsert(200, 20)).length, 1, 'a newer edit is reported as written')
assert.equal((await upsert(300, 5)).length, 0, 'an older edit is refused and is missing from the answer')
assert.equal(Number((await db.query<{ amount: string }>(`select amount from payments where id = '${R}'`)).rows[0].amount), 200, 'the newer edit is kept')
assert.equal((await upsert(400, 20)).length, 1, 'the same version again (a retry) is accepted')
const newProject = '20202020-2020-2020-2020-202020202020'
const insertProject = async (name: string, at: number) =>
  (await db.query<{ id: string }>(
    `insert into projects (id, owner_id, name, created_at, updated_at) values ('${newProject}','${A}','${name}',1,${at})
     on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at returning id`,
  )).rows
assert.equal((await insertProject('New house', 1)).length, 1, 'the creator gets the new project back in the answer')
assert.equal((await insertProject('Renamed', 2)).length, 1)
assert.equal((await insertProject('Stale', 0)).length, 0)
console.log('refused edits are reported: ok')
console.log('money tables: access rules ok')
process.exit(0)
