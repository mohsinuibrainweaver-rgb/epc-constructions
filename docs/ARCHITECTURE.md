# EPC Construction: architecture

Last reviewed: 2026-11-22 (app version 0.22.x). This describes how the code works today. For findings and
recommendations see `ANALYSIS.md`.

## 1. What the app is

A PWA for tracking every payment on a house build. Two people use it: the **investor** (pays, approves) and the
**builder** (spends, enters payments). English and Urdu (right-to-left). Works offline; syncs through Supabase when
signed in.

| Layer | Choice |
|---|---|
| UI | React 19, React Router 7, Tailwind 4, shadcn/ui on Radix, lucide icons, sonner toasts |
| Local data | Dexie (IndexedDB), reactive reads with `dexie-react-hooks` |
| Sync / backend | Supabase: Postgres + RLS, Auth (password), Storage (private `receipts` bucket), Edge Function for push |
| PWA | `vite-plugin-pwa` (generateSW, autoUpdate, skipWaiting + clientsClaim) plus `public/push-sw.js` |
| Build / host | Vite 8, TypeScript, Vercel (`vercel.json` rewrites to `index.html`) |
| Fonts | Inter, Noto Naskh Arabic (Urdu) |

About 26k lines under `src`, `supabase`, `scripts`. No runtime state library: Dexie is the single source of truth and
React reads it through live queries.

## 2. Folder map

```
src/
  App.tsx                 routes, error recovery
  app/AppContext.tsx      language, role (from project membership), project, can(), t()
  shell/Shell.tsx         sidebar / bottom bar, top bar, alerts bell, page title
  pages/                  one file per screen (Home, Phases, Ledger, AddPayment, Contracts, Settlement ...)
  pages/settings/         six settings sections
  components/             shared pieces; components/ui = shadcn primitives
  db/types.ts             the data model (see section 3)
  db/db.ts                Dexie schema, versions 1..n, local-only `conflicts` table
  db/actions.ts           every write (add/update/soft-delete/restore, importBackup)
  db/hooks.ts             live queries
  lib/                    pure logic: stats, settlement, plans, forecast, compare, contracts, region, format ...
  sync/                   engine, mapping (local <-> remote shape), conflicts, payload defaults, device id
  push/                   Web Push subscribe + per-device preferences
  pwa/                    install prompt, chunk-error recovery
  i18n/en.ts, ur.ts       ~1250 lines each; Urdu is a draft awaiting review
supabase/
  schema.sql              tables, RLS, role_guard trigger, storage policy, push tables (idempotent, re-runnable)
  push-triggers.sql       DB trigger that calls the edge function when an entry becomes pending/approved/rejected
  functions/send-reminders  Edge Function: daily reminders, payment events, test push
scripts/                  ~40 `*-test.ts` check scripts, fake Supabase, e2e Postgres rig, Urdu export tools
docs/                     setup guides, accessibility audit, this file
```

## 3. Data model

All synced rows extend `Stamped`: `id` (uuid), `createdAt`, `updatedAt` (client ms), optional `deletedAt` (soft
delete) and `dirty` (1 = not yet on the server).

| Table | Purpose |
|---|---|
| `projects` | name, location, budget, dates, fee settings (`feeBasis`: tbd / fixed / percent / perPhase / retainer) |
| `phases` | ordered, optional budget, `done`, optional per-phase fee |
| `vendors` | people and suppliers, with bank details |
| `payments` | the core record: whole-rupee `amount`, status paid / planned / advance / skipped, mode cash / bank, `paidBy`, approval fields, optional `contractId`, `quantity` + `unit` for materials |
| `attachments` | receipt photos (blob locally, storage path once uploaded) |
| `transfers` | money between the two people: advance, topup, reimbursement, return, fee |
| `plans` | weekly recurring payments, generate payments with deterministic ids |
| `contracts` | agreed amount plus variations (JSON), payments link by `contractId` |
| `files` | documents and progress photos |
| `materials` | retired; folded into payments (`foldMaterials`), kept so old backups still read |
| `conflicts` | local only: this device's edit that a newer remote edit replaced |
| `settings` | local key/value (language, role fallback, region, `member.role.<projectId>` from the server) |

Money is stored in whole rupees. Percent and rate maths round with `Math.round` at the edge.

## 4. Core business rules

* **What counts as spent** (`lib/stats.ts` `isSpent`): paid or advance, not in the bin, and not `pending` or
  `rejected`. Every total, the settlement, budget alerts and push alerts use this one function.
* **Approval** (`lib/approval.ts`): a builder's paid/advance entry is saved `pending` and excluded from totals until the
  investor approves. An investor's own entries count at once.
* **Budgets are estimates** (`budgetState`): none / ok / near (80 percent) / full (within 0.5 percent) / overSlight (up
  to 5 percent over) / over / onEstimate / under. A finished phase is never an alarm.
* **Settlement** (`lib/settlement.ts`): cash the builder holds = transfers in minus builder-paid spending plus returns;
  fee earned depends on `feeBasis`.
* **Permissions** (`lib/permissions.ts`): `can(role, action)` is true only for investors on approve, edit project,
  delete project, edit phases, contracts, transfers, fee, manage people. A builder may edit his own pending or rejected
  entries and planned entries only.

## 5. Sync

Local-first, last-writer-wins by `updatedAt`.

1. **Push**: for each table in `TABLES` (mapping.ts) send rows with `dirty = 1` in chunks of 100 via
   `upsert(onConflict: id).select('id')`. Photos and files upload to storage first.
2. The server ignores a write whose `updated_at` is older than the stored row. Rows missing from the `select` result are
   "refused": the engine pulls the real version and keeps the loser's copy as a `Conflict` the user can restore.
3. **Schema tolerance**: a missing column (`PGRST204`) is dropped from the payload and the row stays dirty; a missing
   optional table (`PGRST205`) is skipped with a warning. This lets a new app version run against an older schema.
4. **Pull**: incremental by `server_updated_at` in pages of 1000; an unsent local edit that is newer or equal wins.
5. **Realtime** plus a debounce timer triggers pushes and pulls; `SyncChip` shows state (off, signedOut, idle, syncing,
   offline, error) and pending count.

## 6. Security model

* The Supabase URL and publishable key ship in `src/sync/config.ts`. That is intended; **RLS is the only protection**.
* RLS is enabled on all 12 tables. Members read and write rows of their project; only investors delete; projects
  and project members have separate policies; there is no insert policy on `project_members` (rows are made by
  security-definer functions: create project, claim invite).
* `role_guard` (security definer trigger) silently ignores forbidden builder writes: no write to projects, contracts,
  transfers; phases only `done`; payments cannot be approved by a builder and approved entries are frozen.
* Storage bucket `receipts` is private, folder = project id, select/insert/update require membership.
* Edge Function `send-reminders` has Verify JWT off. `daily` and `payment-event` require the `x-cron-secret` header;
  `test` requires a valid user token and only notifies that user's own devices. Secrets are Supabase function
  secrets, never in the repo.

## 7. Push notifications

Service worker `push-sw.js` shows messages. Each device row in `push_subscriptions` carries `prefs` (jsonb) and
`reminder_hour` (Pakistan time). A pg_cron job calls the function hourly; the function serves devices whose hour
matches, filters by preferences and remembers budget alerts per device in `push_log`. A DB trigger sends instant
messages for approval events.

## 8. Internationalisation and regional formats

`t()` reads `i18n/en.ts` or `ur.ts`; the document direction follows the language. Region settings (week start, 12/24
hour, date style, thousands vs lakh grouping, currency label) are per device and applied through a module-level
`region` set during render (`lib/region.ts`). CSV stays ISO and plain numbers.

## 9. Testing

No test runner. Each `scripts/*-test.ts` is a standalone `assert` script run with
`npx vite-node scripts/<name>.ts`. Pure-logic scripts need nothing; sync scripts start their own fake REST server
and need `VITE_SUPABASE_URL=http://localhost:<port>` (the port is written at the top of each script: 54397 for
`sync-refused`, 54398 for `sync-conflict`). Always set a localhost URL so tests never reach the real project.
`docs/BACKEND_TESTING.md` describes the Docker Postgres + PostgREST rig for the real `schema.sql`. Accessibility:
`scripts/contrast-test.ts` plus manual axe-core runs (`docs/ACCESSIBILITY.md`).

Result of the 2026-11-22 run: **40 of 40 scripts pass; `tsc -b` and `npm run build` succeed** (76 precache entries,
1.8 MiB).

## 10. Running it

```bash
npm install
npm run dev                         # real Supabase, port 5173
VITE_DISABLE_SYNC=1 npm run dev     # local only, no sign-in
npm run build && npm run preview    # production build with service worker, port 4173
npx vercel@latest deploy --prod --yes   # deploy (use the isometric.mohsin account)
```

`.claude/launch.json` defines `epc-dev`, `epc-preview`, `epc-dev-local` and `epc-dev-fakesync`.
