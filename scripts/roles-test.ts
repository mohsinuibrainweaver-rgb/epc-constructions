// Checks who may do what inside a project, in an in-process Postgres (PGlite) that runs supabase/schema.sql:
// the investor, the builder (invited by a one-time code) and a stranger. Run: npx vite-node scripts/roles-test.ts
import { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const stubs = `
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}'::jsonb);
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
const schema = readFileSync('supabase/schema.sql', 'utf8').replace('create extension if not exists pgcrypto;', '')
const db = new PGlite()
await db.exec(stubs)
await db.exec(schema)
await db.exec('grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;')

const INV = 'aaaaaaaa-0000-0000-0000-000000000001' // the investor, who creates the project
const BLD = 'bbbbbbbb-0000-0000-0000-000000000002' // the builder
const STR = 'cccccccc-0000-0000-0000-000000000003' // a stranger
const P = '11111111-1111-1111-1111-111111111111'
await assert.rejects(
  db.exec(`insert into auth.users values ('00000000-0000-4000-8000-000000000099','nameless@x.com',now(),'{}')`),
  /name_required/,
  'account creation requires a non-blank display name',
)
await db.exec(`insert into auth.users values ('${INV}','inv@x.com', now(),'{"name":"Owner"}'),('${BLD}','bld@x.com', null,'{"name":"Member"}'),('${STR}','str@x.com', now(),'{"name":"Stranger"}')`)

const as = async (id: string, email: string) => {
  await db.exec('reset role')
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${id}","email":"${email}"}', false); set role authenticated`)
}
const asInvestor = () => as(INV, 'inv@x.com')
const asBuilder = () => as(BLD, 'bld@x.com')
const asStranger = () => as(STR, 'str@x.com')
/** Rows the statement reports as written (insert/update ... returning id). */
const wrote = async (sql: string, col = 'id') => (await db.query(`${sql} returning ${col}`)).rows.length
const one = async <T>(sql: string) => (await db.query<T>(sql)).rows[0]
const count = async (table: string) => Number((await one<{ n: string }>(`select count(*)::int as n from public.${table}`)).n)
const row = (table: string, id: string) => one<Record<string, any>>(`select * from public.${table} where id = '${id}'`)

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const phaseId = ID(1), contractId = ID(2), transferId = ID(3), vendorId = ID(4)
const investorPaid = ID(10), plannedRow = ID(11), builderPaid = ID(12), builderPlanned = ID(13)
const pay = (id: string, over: Record<string, string | number | null> = {}) => {
  const v = { id, project_id: P, date: '2026-11-19', amount: 1000, category: 'labour', purpose: 'Test', status: 'paid', mode: 'cash', paid_by: 'investor', created_at: 1, updated_at: 1, ...over }
  const cols = Object.keys(v), vals = Object.values(v).map((x) => (x === null ? 'null' : typeof x === 'number' ? x : `'${x}'`))
  return `insert into payments (${cols.join(',')}) values (${vals.join(',')}) on conflict (id) do update set ${cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`
}

// ---------------------------------------------------------------- the investor sets the project up
await asInvestor()
await db.exec(`insert into projects (id, owner_id, name, budget, created_at, updated_at) values ('${P}','${INV}','House 7',9000000,1,1)`)
assert.equal((await one<{ role: string }>(`select role from project_members where user_id = '${INV}'`)).role, 'investor', 'the creator is the investor')
await db.exec(`insert into phases (id, project_id, name, sort_order, budget, created_at, updated_at) values ('${phaseId}','${P}','Grey structure',3,2000000,1,1)`)
await db.exec(`insert into contracts (id, project_id, title, amount, date, created_at, updated_at) values ('${contractId}','${P}','Grey labour',2500000,'2026-11-01',1,1)`)
await db.exec(`insert into transfers (id, project_id, date, amount, kind, created_at, updated_at) values ('${transferId}','${P}','2026-11-08',500000,'advance',1,1)`)
await db.exec(`insert into vendors (id, project_id, name, created_at, updated_at) values ('${vendorId}','${P}','Ihtisham',1,1)`)
await db.exec(pay(investorPaid, { purpose: 'Investor paid directly' }))
await db.exec(pay(plannedRow, { status: 'planned', purpose: 'Foreman, Thursday', updated_at: 1 }))

// ---------------------------------------------------------------- invitations
const invite = async (role = 'builder') => (await one<{ code: string }>(`insert into project_invites (project_id, role) values ('${P}','${role}') returning code`)).code
const code = await invite()
assert.match(code, /^[0-9A-F]{12}$/, 'a code is 12 characters')
assert.equal((await one<{ n: number }>(`select count(*)::int as n from project_invites where code = '${code}' and expires_at > now() + interval '6 days'`)).n, 1, 'it ends in about 7 days')

await asStranger()
await assert.rejects(db.exec(`select join_project('NOTACODE0000')`), /invalid_code/, 'a wrong code does not join')
assert.equal(await count('project_invites'), 0, 'a stranger cannot read invitations')
await assert.rejects(db.exec(`insert into project_members (project_id, user_id, role) values ('${P}','${STR}','investor')`), /row-level security/, 'nobody adds themselves')
await assert.rejects(db.exec(`insert into project_invites (project_id, role) values ('${P}','investor')`), /row-level security/, 'a stranger cannot invite')

await asBuilder()
assert.equal(await count('payments'), 0, 'before joining the builder sees nothing')
await assert.rejects(db.exec(`select join_project('')`), /invalid_code/)
const joined = await one<{ join_project: string }>(`select join_project('${code.slice(0, 4)}-${code.slice(4, 8).toLowerCase()}-${code.slice(8)}')`)
assert.equal(joined.join_project, P, 'the code works in lower case and with dashes')
assert.equal((await one<{ role: string }>(`select role from project_members where user_id = '${BLD}'`)).role, 'builder', 'and gives the role the invitation named')
assert.equal((await one<{ join_project: string }>(`select join_project('${code}')`)).join_project, P, 'the joining account may safely retry its link')
await asStranger()
await assert.rejects(db.exec(`select join_project('${code}')`), /invalid_code/, 'another account cannot reuse the code')
await asInvestor()
await db.exec(`insert into project_invites (project_id, role, expires_at) values ('${P}','builder', now() - interval '1 minute')`)
const expired = (await one<{ code: string }>(`select code from project_invites where expires_at < now()`)).code
await asStranger()
await assert.rejects(db.exec(`select join_project('${expired}')`), /invalid_code/, 'an expired code does not work')
await asInvestor()
const own = await invite('investor')
await db.exec(`select join_project('${own}')`) // an investor using a code keeps the role they have
assert.equal((await one<{ role: string }>(`select role from project_members where user_id = '${INV}'`)).role, 'investor')

// A shared signup link sends the code with the account payload. Its exact permission snapshot follows that one person.
const signupCode = (await one<{ code: string }>(`insert into project_invites (project_id, role, permissions) values
  ('${P}','builder','{"addPayments":true,"editContracts":true,"manageVendors":false}') returning code`)).code
const LINK = 'eeeeeeee-0000-0000-0000-000000000005'
await db.exec('reset role')
await db.exec(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ('${LINK}','link@x.com',now(),' {"name":"Invited Person","invite_code":"${signupCode}"}')`)
assert.equal((await one<{ role: string }>(`select role from project_members where user_id = '${LINK}'`)).role, 'builder', 'signup payload assigns the invited role')
assert.equal((await one<{ accepted_by: string }>(`select accepted_by from project_invites where code = '${signupCode}'`)).accepted_by, LINK, 'signup consumes the invite for that account')
assert.deepEqual(
  (await db.query<{ permission: string; enabled: boolean }>(`select permission, enabled from member_permissions where project_id = '${P}' and user_id = '${LINK}' order by permission`)).rows,
  [{ permission: 'addPayments', enabled: true }, { permission: 'editContracts', enabled: true }, { permission: 'manageVendors', enabled: false }],
  'signup copies only this link\'s permission snapshot to its member',
)

const EXPIRED_SIGNUP = '00000000-0000-4000-8000-00000000000b'
const expiredSignupCode = (await one<{ code: string }>(`insert into project_invites (project_id, role, expires_at) values ('${P}','builder', now() - interval '1 minute') returning code`)).code
await assert.rejects(
  db.exec(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ('${EXPIRED_SIGNUP}','expired-link@x.com',now(),' {"name":"Expired Person","invite_code":"${expiredSignupCode}"}')`),
  /invite_invalid_or_expired/,
  'an expired signup invite rejects the auth account insert',
)
assert.equal((await one<{ n: number }>(`select count(*)::int as n from auth.users where id = '${EXPIRED_SIGNUP}'`)).n, 0, 'expired invite leaves no account behind')
await as(LINK, 'link@x.com')
assert.equal((await one<{ join_project: string }>(`select join_project('${signupCode}')`)).join_project, P, 'the same account may safely finish an already claimed link')
await asInvestor()
console.log('invitations by code: ok')

// ---------------------------------------------------------------- the builder sees everything
await asBuilder()
for (const [table, n] of [['projects', 1], ['phases', 1], ['contracts', 1], ['transfers', 1], ['vendors', 1], ['payments', 2]] as const) assert.equal(await count(table), n, `the builder sees ${table}`)
assert.equal(await count('project_invites'), 0, 'but not the invitations')

// ---------------------------------------------------------------- what the builder may not do (the write is ignored)
assert.equal(await wrote(`update projects set name = 'Mine', budget = 1 where id = '${P}'`), 0, 'cannot edit the project')
assert.equal((await row('projects', P)).name, 'House 7')
assert.equal(await wrote(`insert into contracts (id, project_id, title, amount, date, created_at, updated_at) values ('${ID(20)}','${P}','New',1,'2026-11-01',2,2)`), 0, 'cannot add a contract')
assert.equal(await wrote(`update contracts set amount = 1 where id = '${contractId}'`), 0, 'cannot edit a contract')
assert.equal(Number((await row('contracts', contractId)).amount), 2500000)
assert.equal(await wrote(`insert into transfers (id, project_id, date, amount, kind, created_at, updated_at) values ('${ID(21)}','${P}','2026-11-09',1,'fee',2,2)`), 0, 'cannot add a transfer')
assert.equal(await wrote(`update transfers set amount = 1 where id = '${transferId}'`), 0, 'cannot edit a transfer')
assert.equal(await wrote(`insert into phases (id, project_id, name, sort_order, created_at, updated_at) values ('${ID(22)}','${P}','Mine',9,2,2)`), 0, 'cannot add a phase')
assert.equal(await wrote(`update phases set budget = 1 where id = '${phaseId}'`), 0, 'cannot change a phase budget')
assert.equal(Number((await row('phases', phaseId)).budget), 2000000)
// The app sends the whole row (an upsert), including the budget it already has: only "done" may differ.
assert.equal(await wrote(`insert into phases (id, project_id, name, sort_order, budget, done, created_at, updated_at) values ('${phaseId}','${P}','Grey structure',3,2000000,true,1,5) on conflict (id) do update set done = excluded.done, updated_at = excluded.updated_at, budget = excluded.budget, name = excluded.name, sort_order = excluded.sort_order`), 1, 'can mark a phase done')
assert.equal((await row('phases', phaseId)).done, true)
assert.equal(await wrote(`insert into phases (id, project_id, name, sort_order, budget, done, created_at, updated_at) values ('${phaseId}','${P}','Grey structure',3,1,false,1,6) on conflict (id) do update set done = excluded.done, updated_at = excluded.updated_at, budget = excluded.budget`), 0, 'done together with a new budget is refused')
assert.equal(Number((await row('phases', phaseId)).budget), 2000000)
assert.equal(await wrote(`insert into project_invites (project_id, role) values ('${P}','builder')`).catch(() => -1), -1, 'cannot invite')
assert.equal(await wrote(`update project_members set role = 'investor' where user_id = '${BLD}'`, 'user_id').catch(() => -1), -1, 'cannot make himself an investor')
assert.equal((await one<{ role: string }>(`select role from project_members where user_id = '${BLD}'`)).role, 'builder')
assert.equal(await wrote(`update project_members set role = 'builder' where user_id = '${INV}'`, 'user_id'), 0, 'cannot demote the investor (the row is not his to change)')
assert.equal((await one<{ role: string }>(`select role from project_members where user_id = '${INV}'`)).role, 'investor')
assert.equal(await wrote(`delete from project_members where user_id = '${INV}'`, 'user_id'), 0, 'cannot remove the investor')
for (const t of ['payments', 'vendors', 'phases', 'contracts', 'transfers']) assert.equal(await wrote(`delete from ${t}`), 0, `cannot delete ${t} rows for good`)
console.log('builder limits: ok')

// ---------------------------------------------------------------- what the builder may do
assert.equal(await wrote(`insert into vendors (id, project_id, name, created_at, updated_at) values ('${ID(30)}','${P}','New foreman',2,2)`), 1, 'adds a vendor')
assert.equal(await wrote(`insert into payment_plans (id, project_id, purpose, amount, weekday, start_date, created_at, updated_at) values ('${ID(31)}','${P}','Labour',90000,4,'2026-11-10',2,2)`), 1, 'adds a weekly payment')
assert.equal(await wrote(`insert into materials (id, project_id, date, item, quantity, unit, rate, amount, created_at, updated_at) values ('${ID(32)}','${P}','2026-11-08','Bricks',1000,'piece',16.5,16500,2,2)`), 1, 'adds a material line')
assert.equal(await wrote(`insert into project_files (id, project_id, kind, title, date, created_at, updated_at) values ('${ID(33)}','${P}','photo','Slab','2026-11-08',2,2)`), 1, 'adds a progress photo')

// His paid entry is always pending, however it is sent.
assert.equal(await wrote(pay(builderPaid, { paid_by: 'builder', approval: 'approved', approved_by: 'me', approved_at: 9, created_at: 2, updated_at: 2 })), 1)
let r = await row('payments', builderPaid)
assert.deepEqual([r.approval, r.approved_by, r.approved_at], ['pending', null, null], 'he cannot approve his own entry, even by sending "approved"')
assert.equal(await wrote(pay(ID(14), { status: 'advance', paid_by: 'builder', created_at: 2, updated_at: 2 })), 1)
assert.equal((await row('payments', ID(14))).approval, 'pending', 'an advance is pending too')
// A planned entry needs no approval; marking it paid sends it for approval.
assert.equal(await wrote(pay(builderPlanned, { status: 'planned', paid_by: 'builder', created_at: 2, updated_at: 2 })), 1)
assert.equal((await row('payments', builderPlanned)).approval, null)
assert.equal(await wrote(pay(builderPlanned, { status: 'paid', paid_by: 'builder', created_at: 2, updated_at: 3 })), 1, 'marks a planned entry paid')
assert.equal((await row('payments', builderPlanned)).approval, 'pending')
assert.equal(await wrote(pay(plannedRow, { status: 'paid', purpose: 'Foreman, Thursday', paid_by: 'builder', updated_at: 4 })), 1, 'also an entry that was planned by the investor')
assert.equal((await row('payments', plannedRow)).approval, 'pending')
// He may change his own pending entry.
assert.equal(await wrote(pay(builderPaid, { amount: 1200, paid_by: 'builder', created_at: 2, updated_at: 5 })), 1, 'edits his pending entry')
assert.equal(Number((await row('payments', builderPaid)).amount), 1200)
// But not the investor's own paid entry.
assert.equal(await wrote(pay(investorPaid, { amount: 1, updated_at: 9 })), 0, 'cannot change an entry the investor made')
assert.equal(Number((await row('payments', investorPaid)).amount), 1000)
assert.equal(await wrote(`update payments set deleted_at = 9, updated_at = 9 where id = '${investorPaid}'`), 0, 'nor delete it')
console.log('builder allowed: ok')

// ---------------------------------------------------------------- the investor decides
await asInvestor()
assert.equal(await wrote(`update payments set approval = 'approved', approved_by = 'Mohsin', approved_at = 20, updated_at = 20 where id = '${builderPaid}'`), 1, 'the investor approves')
assert.equal(await wrote(`update payments set approval = 'rejected', approved_by = 'Mohsin', approved_at = 20, reject_reason = 'wrong amount', updated_at = 20 where id = '${builderPlanned}'`), 1, 'or rejects')
await asBuilder()
assert.equal(await wrote(pay(builderPaid, { amount: 5, paid_by: 'builder', created_at: 2, updated_at: 30 })), 0, 'an approved entry can no longer be changed by the builder')
assert.equal(Number((await row('payments', builderPaid)).amount), 1200)
assert.equal(await wrote(`update payments set deleted_at = 30, updated_at = 30 where id = '${builderPaid}'`), 0, 'nor deleted')
assert.equal(await wrote(pay(builderPlanned, { status: 'paid', amount: 777, paid_by: 'builder', created_at: 2, updated_at: 31 })), 1, 'a rejected entry can be corrected')
r = await row('payments', builderPlanned)
assert.deepEqual([r.approval, r.reject_reason, Number(r.amount)], ['pending', null, 777], 'and goes back to pending')

await asInvestor()
await db.exec(`update projects set name = 'House 7 (renamed)', updated_at = 40 where id = '${P}'`)
assert.equal((await row('projects', P)).name, 'House 7 (renamed)', 'the investor edits the project')
assert.equal(await wrote(`update contracts set amount = 2600000, updated_at = 40 where id = '${contractId}'`), 1, 'and the contract')
assert.equal(await wrote(`update phases set budget = 2100000, updated_at = 40 where id = '${phaseId}'`), 1, 'and the phase budget')
// Changing roles: only an investor changes another person's.
assert.equal(await wrote(`update project_members set role = 'investor' where user_id = '${BLD}'`, 'user_id'), 1, 'the investor can promote the builder')
await db.exec(`update project_members set role = 'builder' where user_id = '${BLD}'`)
await assert.rejects(db.exec(`update project_members set role = 'builder' where user_id = '${INV}'`), /permission/, 'an investor cannot demote himself')
console.log('investor: ok')

// ---------------------------------------------------------------- per-member permissions; the creator always bypasses them
await db.exec(`insert into member_permissions (project_id, user_id, permission, enabled) values
  ('${P}','${BLD}','editContracts',true),
  ('${P}','${BLD}','manageVendors',false),
  ('${P}','${INV}','editProject',false)
  on conflict (project_id,user_id,permission) do update set enabled = excluded.enabled`)
assert.equal(await wrote(`update projects set location = 'Lahore', updated_at = 41 where id = '${P}'`), 1, 'owner bypasses member permissions')
await asBuilder()
assert.equal(await wrote(`update contracts set amount = 2700000, updated_at = 41 where id = '${contractId}'`), 1, 'owner can grant a builder permission')
assert.equal(await wrote(`update vendors set name = 'Blocked' where id = '${vendorId}'`), 0, 'owner can remove a builder permission')
assert.equal(
  await wrote(`update member_permissions set enabled = true where project_id = '${P}' and user_id = '${BLD}' and permission = 'manageVendors'`, 'permission'),
  0,
  'a member cannot change their own permissions',
)
await asInvestor()
console.log('configurable permissions: ok')

// ---------------------------------------------------------------- email invitations need a confirmed email
await db.exec(`insert into project_invites (project_id, email, role) values ('${P}','late@x.com','builder')`)
await db.exec('reset role')
const LATE = 'dddddddd-0000-0000-0000-000000000004'
await db.exec(`insert into auth.users values ('${LATE}','late@x.com', null,'{"name":"Late Member"}')`)
await as(LATE, 'late@x.com')
assert.equal((await one<{ claim_invites: number }>('select claim_invites()')).claim_invites, 0, 'an unconfirmed email claims nothing')
assert.equal(await count('payments'), 0)
await db.exec('reset role')
await db.exec(`update auth.users set email_confirmed_at = now() where id = '${LATE}'`)
await as(LATE, 'late@x.com')
assert.equal((await one<{ claim_invites: number }>('select claim_invites()')).claim_invites, 1, 'a confirmed email does')
assert.ok((await count('payments')) > 0)

// ---------------------------------------------------------------- removing and leaving
await asInvestor()
assert.equal(await wrote(`delete from project_members where user_id = '${LATE}'`, 'user_id'), 1, 'the investor removes a member')
await as(LATE, 'late@x.com')
assert.equal(await count('payments'), 0, 'who then sees nothing')
await asBuilder()
assert.equal(await wrote(`delete from project_members where user_id = '${BLD}'`, 'user_id'), 1, 'a builder can leave')
assert.equal(await count('payments'), 0)

// ---------------------------------------------------------------- the dashboard and the service key are not limited
await db.exec('reset role')
await db.exec(`select set_config('request.jwt.claims', '', false)`)
assert.equal(await wrote(`update contracts set amount = 1 where id = '${contractId}'`), 1, 'no signed-in person: not limited')
console.log('roles: all checks passed')
process.exit(0)
