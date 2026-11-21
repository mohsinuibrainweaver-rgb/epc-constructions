# EndPoint Construction (Endpoint Clients Construction)

Installable web app (PWA) for tracking every payment on a house build. Mobile first, scales to large
monitors, English and Urdu. Built with React, Tailwind CSS and shadcn/ui; Inter is the only typeface (Noto Naskh
Arabic for Urdu); the Endpoint Clients indigo `#4338CA` is the single brand colour.

Local-first: everything is saved on the device (IndexedDB) so it works offline. With a Supabase project
connected it also syncs between you and your brother (sign-in by emailed code, live updates, private photos).
Without one it runs on this device only. **To connect it, follow `docs/SUPABASE_SETUP.md`.**

## Live

https://epc-construction.vercel.app (Vercel project `epc-construction`, account isometric.mohsin@gmail.com).
Redeploy with `npx vercel@latest deploy --prod --yes`.

## Updates

The app updates itself: a new version installs in the background and the page reloads, so an old page is never
mixed with new files. If a screen file is ever missing after a release, the app drops its cached copy and loads the
current version once (`src/pwa/recover.ts`), or shows a Reload button. A phone that still holds a version from before
2026-11-15 and shows a blank screen needs its site data cleared once.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173, hot reload (service worker off)
npm run build        # type-check and production build with the service worker
npm run preview      # http://localhost:4173, test install and offline here
node scripts/make-brand-assets.cjs   # mark-only logo files and PWA icons, made from the two logo files in src/assets/brand
```

Install and push need `https` (or `localhost`). To try it on a phone, deploy the `dist` folder to any static host.

## Interface and accessibility

- shadcn/ui components (Radix primitives) themed in `src/index.css`; shared building blocks in `src/components/common.tsx`.
- Targets WCAG 2.2 AA: visible focus ring everywhere, 44 px touch targets, labels, hints and errors tied to fields
  (`aria-describedby`, focus moves to the first error), skip link, focus moved to the page on navigation,
  dialogs with focus trap, status never shown by colour alone, reduced-motion respected, right-to-left layout.
- An automated axe-core check (WCAG 2.0 / 2.1 / 2.2 A and AA rules) found no violations on Home, Phases,
  Vendors, Ledger, Reports, Settings, Add payment, More, Projects and the vendor dialog. Automated checks
  catch only part of the issues, so a keyboard and screen-reader pass on real devices is still needed.
- `VITE_DISABLE_SYNC=1 npm run dev` runs local-only (no sign-in) for design work.

## What works now

- Projects from zero: name, location, thumbnail, plot, budget, dates; standard 12-phase template or blank.
- Phases with budgets, progress and 80 / 100 percent warnings; reorder, rename, delete.
- Payments: standard and Miscellaneous (no vendor needed), status Paid / Planned / Advance, cash or bank,
  who paid, receipt photos (compressed on the device), duplicate warning, 30-day bin with Undo.
- Vendors with phone, bank account, per-vendor payments and a shareable statement.
- Ledger with filters and CSV export; reports by phase, vendor, category, month and cash versus bank.
- Alerts (bell): budgets reaching 80 / 100 percent, overdue and due-soon planned payments.
- Backup and restore (JSON), bin, install help, notification permission.
- English and Urdu with right-to-left layout (Urdu text is a draft and needs review).
- Layout: bottom tabs on phones, icon sidebar on tablets, full sidebar on laptops, main content in a
  centred 1280 px grid that never stretches.

## Backend (Supabase)

- `supabase/schema.sql`: tables, row level security (only project members see a project), private photo bucket, live updates.
- `src/sync/`: sign-in, push and pull engine (last edit wins, soft deletes), live updates, photo upload.
- Tested against a real Postgres + PostgREST with the real schema: two people sharing a project, edits and
  deletes reaching the other device, and a stranger seeing nothing. See `docs/BACKEND_TESTING.md`.
- Not yet tested against a live Supabase project: email sign-in, photo upload and live updates.
- **An edit is never lost silently.** If two phones edit the same row, the server keeps the newer edit and ignores the older
  one without an error. The sync engine now asks the server which rows it really wrote (`.upsert(...).select('id')`); a row
  that is missing from the answer was refused. This device then fetches the newer version, keeps its own version in a local
  `conflicts` table (Dexie v7, never synced) and shows it in the Alerts bell and in a message, where the person chooses
  **Keep current** or **Use mine** (`src/sync/conflicts.ts`, `src/components/ConflictsDialog.tsx`). "Use mine" saves the
  version again with a time later than the one it replaced, so a phone with a slow clock still wins when asked to.
  No server change is needed. Checks: `npx vite-node scripts/conflict-test.ts`, `scripts/schema-test.ts`, and
  `VITE_SUPABASE_URL=http://localhost:54398 VITE_SUPABASE_ANON_KEY=test-key-not-a-secret npx vite-node scripts/sync-conflict-test.ts`
  (two phones against a local fake server; always set the URL, or the app's real project is used).
- **Mixed batches no longer fail.** The server writes the rows of one request as a batch, and a column that one row leaves out is
  stored as NULL when another row has it. A phase marked complete (or with a fee) next to phases that were never touched made the whole
  batch fail ("null value in column done"), so a new project with some completed phases could not sync. Columns that cannot be NULL on
  the server (`phases.done`, `projects.fee_basis`) now get their default for such rows (`fillDefaults` in `src/sync/payload.ts`; the
  list is `defaults` in `src/sync/mapping.ts`). Check: `npx vite-node scripts/payload-test.ts`.

## Money features (investor and builder)

- **Weekly payments** (`/plans`): a payment that repeats on a weekday, such as the labour foreman on Thursday. The
  app creates this week's and next week's payment as Planned; on Home you can Pay, Move or Skip it (with a reason).
  Two phones create the same row (the id comes from the plan and date), so there are no duplicates.
- **Settlement** (`/settlement`): advances, top-ups, reimbursements, returned money and fee payments between you and
  your brother, the construction balance (who owes whom), the builder's fee (decide at the end, a fixed amount, or a
  percentage of the cost), the total due, and print or save as PDF.
- After updating, run `supabase/schema.sql` once in Supabase (see `docs/SUPABASE_SETUP.md`, step 4b).
- Checks: `npx vite-node scripts/money-test.ts` (settlement and plan logic), `npx vite-node scripts/schema-test.ts`
  (the SQL and its access rules, in-process Postgres), `scripts/sync-fallback-test.ts` (old versus updated server).

## What Add payment learns from earlier payments

The old "Repeat a recent payment" chips are gone: replaying 134 payments, a chip matched only 5 times (about 4%), and its amount was
never the same. What does repeat is the vendor, so the form learns from that (`src/lib/recent.ts`).

- **Choosing a vendor** looks at the last payment really made to them (paid or advance, not removed or rejected). It fills in the
  **category** (right 98% of the time on the sample data) and **who paid** (92%), unless the person already chose that field; the
  note under the vendor says what was set. The **phase** (77%) is only offered as a button, because a wrong one charges the wrong budget
  without a sign. The **mode** (cash or bank) is not touched: it was barely better than the default (66% against 62%). Not done when
  editing or for a miscellaneous payment's category. On average this leaves 0.7 of 4 fields to correct, against 1.3 with the
  previous entry carried over and 2.25 with plain defaults.
- **A possible double entry**: the same vendor and the same item within a week of the date gives a warning before saving.
- **Recent payments** (`RecentPayments`): a grey box to the right of the form with the last 5 entered (View more: 15), newest entry
  first (so a back-dated one shows), with quantity for material and a status pill for anything not plainly paid. Weekly-plan
  payments are left out. Read only on purpose (a tap that left the page would lose what is half typed); payments to the chosen vendor
  are outlined. It shows only where the form's own column is at least 56 rem wide (a container query, so the side menu is taken into
  account) and is hidden on a phone and on a narrow tablet. The payment being edited is not listed.
- Check: `npx vite-node scripts/recent-test.ts`.

## Home: "Needs your attention", and due payments first on a phone

- **Needs your attention (n)** card under the four figures (hidden when there is nothing). Rows, most important first: budgets over their
  limit and contracts paid beyond what was agreed (danger), budgets from 80% (warning), then tidy-up items: payments with no vendor or
  payee, bank transfers with no bank details, and paid payments with no receipt photo. Each row is an icon plus words and opens the screen
  where it is fixed; the first three rows show and the rest sit behind "Show n more". Due payments and approvals keep their own cards
  (they have buttons). The rules are in `src/lib/attention.ts`; the receipts are read live (`useReceiptIds`) and "no receipt" is never
  claimed before they are read.
- **Ledger → Missing** is a new filter (No receipt photo / No vendor or payee / No bank details) that the card's tidy-up rows open
  (`/ledger?missing=receipt|vendor|bank`), using the same rules.
- **Due and upcoming** moves above Recent payments on a phone when a planned payment is overdue or due within three days; on a wide
  screen the layout is unchanged (Recent on the left, Due and Phase progress on the right).
- Check: `npx vite-node scripts/attention-test.ts`.
- **Phase progress** lists the phases that matter, not all twelve: those with spending or a budget, over-budget first, then nearest the
  limit, then by spending, at most five (`phaseProgress` in `src/lib/stats.ts`). A row shows "spent of budget", the bar, and a badge with
  an icon and words ("84% used", "Budget reached" when spending equals the budget, "Over budget" when it is more); a phase without a
  budget shows "No budget set". Below the rows: "Phases not started: n" and, when fewer than half the phases have a budget, "Phases with
  a budget: x of y" with a "Set budgets" link. Check: `npx vite-node scripts/phase-progress-test.ts`.
- The wording "is over budget" in the alerts is now "has used its whole budget", because the alert starts at 100%, which is reaching the
  budget as well as passing it. The Ledger count says "1 payment" for one.

## Ledger sort and summary, and "Spending over time" (Reports)

- **Ledger** shows, above the list and for the rows that match the filters: the count and the **paid** total (as before), plus
  **Planned** and **Awaiting approval** totals when there are any (they are not counted as spent). A **Sort by** drop-down orders the
  list: Newest first (as before, the default), Oldest first, Largest amount, Smallest amount; equal entries keep a stable order (later
  date, then added later). The sort is only a view, it is not saved. Rules in `src/lib/ledger.ts`.
- **Reports → Spending over time** is a line chart of the total paid and approved, month by month (months with nothing stay on the line).
  Planned payments continue it as a dashed line ("If planned payments are made"); a planned payment dated this month or earlier shows as a
  hollow dot at the end. The project budget appears as a dotted reference line only when it is at most 2.5 times the highest figure, so
  a huge budget never flattens the line (the phase bars on Home show budgets). Plain SVG, no chart library, always left to right; a
  hidden table gives screen readers the same figures. Rules in `src/lib/trend.ts`, drawing in `src/components/TrendChart.tsx`.
- Check: `npx vite-node scripts/ledger-test.ts`.

## Budget plan (top of Phases)

- A **Budget plan** card above the phase list: "x of y given to phases" with a bar (the phase budgets added together against the project
  budget), then either "Still to give out: z", "The whole project budget is given to phases", or, when the phase budgets add up to more
  than the project budget, a warning badge ("Phase budgets are z more than the project budget"). Without a project budget it says so and
  links to the project form to set one. It also shows "n of m phases complete", "n without a budget", and "x paid is not in any phase"
  (paid and approved money with no phase, which no phase bar shows).
- Rules in `budgetPlan` (`src/lib/stats.ts`); removed phases are ignored and a budget of 0 counts as none. Check:
  `npx vite-node scripts/budget-plan-test.ts`. Nothing is stored; it is worked out from the phases and payments.

## Cash forecast (`/forecast`)

What the coming weeks will cost, from what is already written down. Open it from the menu ("Cash forecast"). Nothing is stored; it is
worked out from the payments, weekly plans, contracts and transfers (`forecast` and `cashAdvice` in `src/lib/forecast.ts`).

- **Needed in the next 30 days** as the headline figure, with what is overdue included, and below it: overdue, next 7 days, planned later
  than the 12 weeks shown, and the money on active contracts that has no day yet.
- **What counts:** planned payments (overdue ones are due now); the weekly plans' coming payments. The app creates a plan's payment only a
  week ahead, so the later Thursdays (or whichever day) are projected as **expected** unless a payment for that plan and day already
  exists (paid, skipped, planned or removed); the unplanned balance of each active contract (agreed total minus paid, waiting for
  approval and already planned). Paid and approved money is spent, so it is not in the forecast.
- **Who pays:** a small table gives the next 7 and 30 days as total due, what you pay and what the builder pays (a row only when he has
  payments). A box, "Can the builder pay his part?", says what he must pay in 30 days, the cash of yours he holds (from Settlement: a
  negative builder balance), and either "Send him about Rs x" or what is left with him. The last figure is **Cash you need to arrange
  for the next 30 days**: what you pay yourself plus what you still have to send him (`cashToArrange` in `src/lib/forecast.ts`); the
  cash he already holds is not counted again. The table and boxes are in `src/components/ForecastTable.tsx`.
- **Week by week:** columns for 12 weeks starting today (planned solid, expected with a dashed outline, overdue first in amber), the
  amount written above each column (on a phone, above the chosen one), and a sentence under the chart saying that later weeks look small
  only because nothing but the weekly payment is planned there. Tap a
  column or use the arrow keys, and what is due in that week is listed under the chart; a planned payment opens for editing. The
  chart is plain SVG, always left to right, with the colours of the Compare page.
- **Contracts with money not yet planned** lists the contracts that still need a planned payment, each opening the contract.
- **Not on Home.** Home already holds a lot, so the forecast is only reached from the menu (Cash forecast, also under More on a phone).
- Check: `npx vite-node scripts/forecast-test.ts`.

## Sign in and Create account (`src/pages/SignIn.tsx`)

Two modes on one page, chosen with the two buttons at the top, so the main button always says what it will do. Before, both buttons were
greyed out until the password reached 6 characters, with nothing saying why; now nothing is greyed out (only while it is working) and a
message under the field says what is missing.

- **Sign in**: email and password. A wrong email or password says so in plain words and points to Create account.
- **Create account** also asks for **your name** (shown next to the payments you add and on statements). It does not ask for a role:
  the role comes from the project (see "Roles in a project" below).
  Phone number, address and the like are not asked: nothing in the app uses them.
- The password field has a show/hide button. An email that already has an account is told to sign in instead.
- The name belongs to the **account** (its `user_metadata`), not to the phone. When a phone signs in as an account it takes them
  from the account (`SyncProvider`, `src/lib/profile.ts`), so values left on the phone by another account (a test account, say) never show
  up. Changing them in Settings, Account saves them to the account as well. An older account that has no name or role yet keeps whatever
  the phone has until it is set once in Settings.

## Roles in a project, and invitations (`supabase/schema.sql`, `src/lib/permissions.ts`)

A person is an **investor** or a **builder** *in each project* (`project_members`), not on the phone. The person who creates a project is its
investor. The server decides what each may do; the app leaves out the buttons a builder could not use. **Anyone in a project sees all of it**
(payments, budgets, contracts, vendors, settlement, reports): the two of you work from the same numbers. What differs is who may write.

| | Investor | Builder |
|---|---|---|
| Add payments (with material quantities), vendors, files, weekly payments; mark a phase done | yes | yes |
| A paid or advance entry | counts at once | waits for the investor (always pending, however it is sent) |
| Approve or reject entries | yes | no |
| Change or delete an entry | any | a planned one, or his own that is pending or turned down; not an approved one, and not a paid one the investor entered |
| Project details, phases and their budgets, contracts, advances/transfers, the builder's fee | yes | read only |
| Invite, remove people, change roles, delete the project | yes | no (a builder may leave) |

- **Server rules** (`role_guard`, `member_guard`, policies): a write a builder may not make is *ignored*, never an error, so one refused row does
  not fail the batch the app sends. Nobody changes their own role; only an investor changes another person's. Only an investor reads, makes or
  withdraws invitations. Dashboard and service-key writes are not limited.
- **In the app** `settings.role` is the role in the open project (`member.role.<project id>`, refreshed from the server on every sync and
  kept for offline use); a project that has not reached the server, or no account, falls back to the setting on the device. Settings, Account
  shows the role read only when the project decides it. `can(action, projectId?)` in `useApp()` hides the investor-only buttons; an Edit project
  address opened by a builder says only the investor can do it; an approved entry opened by a builder shows a notice and cannot be saved.
- **If the server refuses anyway** (`sync/engine.ts`): a refused *new* row is taken off the phone and a notice says so; a refused *edit* is
  replaced by the server's version (and kept in the "changed by someone else" notice).
- **Invitations are one-time codes.** Settings, Project, People (investor only): choose Builder or Investor, **Create invite code**, then **Send on
  WhatsApp** or **Copy code**. A code is 12 letters and numbers (ABCD-EFGH-IJKL), works once and ends after 7 days; no email is sent. The other
  person creates an account, then chooses **Join with a code** (on the start screen or Projects) and enters it, or opens the link in the message
  (`/join?code=...`). They get the role the code names. A code can be withdrawn before it is used.
- Invitations to an **email address** still work, but only for an address the person has confirmed, so nobody can claim one by registering
  someone else's address (`claim_invites`).
- **Setup:** run `supabase/schema.sql` once more in Supabase, SQL Editor (it is safe to run again). Until then the app still works as before; Join
  with a code says the server is not updated yet.
- Checks: `npx vite-node scripts/roles-test.ts` (the server rules, in an in-process Postgres), `scripts/permissions-test.ts`,
  `scripts/schema-test.ts`, and `VITE_SUPABASE_URL=http://localhost:54397 VITE_SUPABASE_ANON_KEY=test-key-not-a-secret npx vite-node scripts/sync-refused-test.ts`.

## Whose data is on this phone (`src/sync/device.ts`, `src/lib/device-owner.ts`)

Which projects an account sees is decided by the server (row level security: you are a member of the project, by invitation or because
you created it). But the app keeps its data **in the browser**, so when a different account signed in on the same phone the old
account's projects were still listed. Now the phone remembers which account its data belongs to (`device.userId`), and after sign-in,
before anything is shown or synced:

- Same account as before, or a phone with no owner yet whose projects the server shows to this account: normal. (A local-only install
  that never synced belongs to the first account that signs in, as before.)
- The data belongs to another account: a screen says so. **Sign out** goes back to that account; **Remove them from this phone** (asks
  twice) clears only this phone and starts the new account clean. The other account's data is untouched on the server. If that account
  had changes that never reached the server, the screen warns and offers a backup file first.
- Removing keeps the language and region and clears everything else, including the name and role, which are then taken from the new account.
- Check: `npx vite-node scripts/device-owner-test.ts`.

## New project and Edit project (`/projects/new`, `/projects/:id/edit`)

One form for both, in the same look as the other screens: a **Back** link, a title with one line under it, and the fields in cards —
**Basics** (photo, name, location), **Size of the house** (plot, covered area, floors), **Budget and dates**, and, for a new project only,
**Phases**. The page stays outside the main menu on purpose, so it also works before any project exists.

- Only the name is needed. Without it the page says so, moves to the name field and does not save.
- While you type, it works out **the budget for each sq ft** (budget ÷ covered area) and **how long the build is** (start to finish), and
  warns when the finish date is before the start. These are small pure functions in `src/lib/project-plan.ts`,
  checked by `npx vite-node scripts/project-plan-test.ts`.
- The Phases card lists the 12 standard phases before you choose, so "Standard house build" is not a surprise; "Blank list" says you add
  your own later.
- **Create project** / **Save** is disabled while saving, so a double tap cannot make two projects. On a phone the Cancel and Save buttons
  stay at the bottom of the screen.

## The Projects screen (`/projects`)

One card per project, all the same height with their buttons on one line: the picture (nothing drawn over it), then the marks **Current** and
your role in that project (Investor or Builder), the name and place, **Spent so far** in large type and, when the project has a budget,
the share used (amber from 80 percent, red from 100), a bar, and "of {budget}". **Open** is the main button; **Edit** and **Delete** are
small icon buttons (and are left out for a builder, who may not use them). On the same screen: **Join with a code** and **New project**.

## Deleting a project (Projects screen)

Every project card on the **Projects** screen has a **Delete** button (it was only in Settings, Project, and only for the open project). It opens
the same safeguard as before: it says what is removed, offers a backup file, and asks for the project name to be typed before the red button
works. It is a soft delete, so the other phones learn of it. Deleting a project that is **not** the open one no longer switches the open
project (`deleteProject` in `src/db/actions.ts`, tested in `scripts/delete-project-test.ts`); deleting the open one opens the most recently
changed one left. Afterwards you return to the list of projects, or to the start screen when none is left.

## Compare projects (`/compare`)

A page that puts two projects side by side: where the money went in an earlier project and where it is going in this one. Open it
from the menu ("Compare projects", also under More on a phone). It starts with this project against the most recently changed other
one; the two drop-downs choose any pair, and the choice is kept in the address (`?a=…&b=…`).

It is built to be read top to bottom, the answer first:

- **Colour key.** The earlier project is always **orange** and this project always **blue** (tokens `--viz-a` / `--viz-b`, checked with
  the dataviz palette validator on both themes: colour-blind distance above 24, 3:1 on the surface). The dot beside each drop-down is the
  key for everything below; marks carry the colour, text stays in ink.
- **Show amounts: Total or Per sq ft.** Per sq ft divides each project by its own covered area; disabled until both have one.
- **The answer.** A large figure: "71% more spent than the earlier project", compared **at the same stage** (the month this project
  is in now), with both amounts, then the phases that cost most more and most less than before.
- **Key numbers** in tiles with both values: spent so far, cost per sq ft, budget used, and the average change of material prices.
- **Spending pace:** a line chart of the total spent by the end of each month since the start. It opens on the same-stage month; move
  the pointer over it, touch it, or use the arrow keys to read any month: the two values and the difference are written under the chart.
  A project paid within the last 45 days is still running, so its line goes on to today.
- **By phase** and **By category:** two bars per row on one scale with the value at the tip of each bar, and the difference beside the name.
  Phases can be ordered by build order or by biggest difference. Phases are matched by standard step, or by name for one added by hand.
- **Material rates:** how much the average rate paid changed for each item and unit bought in both projects, as bars around zero (amber for
  a rise, green for a fall, with an arrow and words).
- **All figures** (collapsed) holds the full list of numbers.
- **Not a verdict while a project is unfinished.** If either project has a phase that is not complete, differences read "More so far" /
  "Less so far" in a neutral colour, and a phase that is not complete or not started is never called cheaper. Only paid and approved money
  counts. Plain SVG and CSS, no chart library; the pace chart also has a hidden table for screen readers.
- Rules: `src/lib/compare.ts`; drawing: `src/components/CompareParts.tsx`; page: `src/pages/Compare.tsx`. Check:
  `npx vite-node scripts/compare-test.ts`. Nothing is stored.

## Home order and a lighter Home

- **On a phone the cards follow what needs doing:** four figures, approvals, Due and upcoming, Needs your attention, Recent
  payments, Phase progress. (On a wide screen the layout is as before: Recent on the left, Due and Phase progress on the right.) This is
  done with CSS `order` and a wrapper that steps aside on small screens, so nothing is rendered twice.
- **Due and upcoming** starts with three payments ("Show n more" for the rest, up to eight) instead of five, so the cards below it are not
  pushed far down.
- **Recent payments** no longer lists planned payments; they are in Due and upcoming.

## Contracts list: next payment

Each active contract card shows its **Next payment** (the earliest planned one, with an Overdue badge when its day has passed, and "+n more
planned") and, when some of the contract has no day yet, "No day set yet for Rs x" (`nextInstalment` in `src/lib/contracts.ts`, tested in
`scripts/contracts-test.ts`). Titles and vendor names wrap instead of being cut.

## Contract payment schedule (`/contracts/:id`)

A contract can be with any vendor of the project (or none). Its page now has a **Planned payments** card:

- The contract's **planned payments by day**, each with Mark paid / Move / Skip (the same as in Due and upcoming), and **Not planned
  yet** (what is left after what is paid, waiting for approval and already planned; `unplannedBalance` in `src/lib/contracts.ts`).
- **Pay the remaining Rs x now** opens Add payment for this contract with the amount already filled in (for settling what is left in one go, instead of planning it): `/add?contract=…&amount=…`.
- **Plan payments** (the button reads **Plan the remaining Rs x** once some payments are already planned) opens with **One payment** (an amount and a day) or **In instalments** (how many, 2 to 12, the first day, then every week, 2 weeks or month) to spread that amount. The amount is split
  in parts rounded to 100 with the last part taking the rest, so they add up exactly; months keep the day (31 Jan, 28 Feb, 31 Mar). Every
  date and amount can be changed before saving; a warning shows when the instalments are more than what is left. The category, mode and
  who pays start from the contract's earlier payments.
  The first day offered is one step after the contract's latest payment (a week from today when it has none), so new instalments come
  after the ones already there and the numbers follow the days; choosing an earlier day shows a warning (`firstInstalmentDay`).
- Saving creates ordinary **planned payments linked to the contract** (with its vendor and phase), named "title: instalment n" (a single payment is just "title: payment"). Nothing
  new is stored on the server, so they sync like any payment, and they appear in Due and upcoming and in the **Cash forecast**; the
  contract then leaves "Agreed on contracts, but no day set yet".
- Rules: `src/lib/schedule.ts`, action `planInstalments` in `src/db/actions.ts`, dialog `src/components/InstalmentsDialog.tsx`. Check:
  `npx vite-node scripts/schedule-test.ts`.

## Phase page (`/phases/:id`)

- Under the spent-and-budget bar: **Budget left** (or **Over budget by**, in red, when spending passed the budget), **Planned**,
  **Awaiting approval** (only when there is some) and **Entries** (everything on the phase that is not removed).
- **Where the money went**: paid and approved money on the phase grouped by vendor (or payee name, or "No vendor"), largest first,
  with bars. Planned, waiting and removed entries are not in it.
- Rules: `phaseFigures` and `spentBy` in `src/lib/stats.ts`. Check: `npx vite-node scripts/phase-detail-test.ts`. Nothing is stored.

## Vendors list and a vendor's page

- **List:** a **Sort by** drop-down (Name, as before; Most paid; Recently paid, with vendors never paid last), a count line ("11 vendors,
  Rs x paid"), and each row shows the role and **Last paid {date}** under the name and, when the vendor has an active contract with money
  left, "Rs x left on contracts" under the amount. The search now matches the name, the role as written on screen, or the phone number
  (spaces and dashes ignored).
- **A vendor's page:** a **Last paid** card and, when there is an active contract, **Left on contracts**; a **Contracts** card with the
  vendor's contracts (same bar and state as the Contracts screen, each opens the contract). Planned now means this vendor's planned
  payments only, as before.
- **Add payment from a vendor's page** opens `/add?vendor=…` with that vendor already chosen (and its only open contract, its phase,
  and, for a transfer, its bank details, as when the vendor is picked by hand). The recent-payment chips are hidden then, and "Save and
  add another" keeps the vendor.
- Rules in `src/lib/vendors.ts`. Check: `npx vite-node scripts/vendors-test.ts`.

## Bank details of a transfer (Add payment, Vendors, Ledger)

- **Add payment:** when the mode is **Bank transfer**, a "Bank details (optional)" box appears with **Bank** (suggestions of common
  banks and wallets, any name can be typed), **Account number or IBAN** and **Reference or transaction ID**. Choosing a vendor, or
  switching to Bank transfer with a vendor chosen, fills the bank and account from the vendor's saved details (only where the form has
  none yet). Switching to Cash removes them from the payment. The Repeat-a-recent-payment chips carry the bank and account, not the reference.
- **Vendors:** the vendor form has a new **Bank** field next to the existing **Bank account** (which is the account number or IBAN);
  the vendor page shows both.
- **Ledger and vendor pages:** a bank payment shows "Bank transfer · Meezan Bank · …6702" (only the end of the account; the full number is
  on the payment). The Ledger and Statement CSV files get `bank_name`, `bank_account`, `bank_ref` as **last** columns, so the columns
  people already use keep their places.
- **Database:** new columns `payments.bank_name`, `payments.bank_account`, `payments.bank_ref`, `vendors.bank_name` in `supabase/schema.sql`
  (additive, safe to run again). Run it once in Supabase (SQL Editor). Until then everything else syncs as before; payments that carry
  bank details wait on the phone and are sent after the update. **Settings → Data and backup** shows a "Copy the update SQL" button
  next to the schema note, so the update is one paste into the SQL Editor.
- Code: `src/lib/bank.ts`. Check: `npx vite-node scripts/bank-test.ts`, `scripts/schema-test.ts`.

## Save and add another, and the builder's approval hint (Add payment)

- **Save and add another** (new payments only): saves, shows "Saved. Add the next payment.", and empties the form for the next one
  while keeping what usually stays the same in a run of entries: date, phase, category, status, mode and paid by (and the contract
  and vendor when the page was opened from a contract). The cursor goes to Amount. On phones it is a full-width outline button
  above the sticky Save bar (which is unchanged); on wider screens it sits in the bar between Cancel and Save. The duplicate warning's
  "Save anyway" keeps the "add another" choice. After it, the Repeat a recent payment chips offer the payment just saved.
- **Approval hint:** when the device's role is Builder and the status is Paid or Advance (the entries that wait for the investor),
  an info line under Status says so before saving, using the same rule as the saving code (`needsApproval`).

## Phase budget hint (Add payment)

When a phase with a budget is chosen, one line under the phase says how much of it is spent ("Grey structure: Rs 95,000 of Rs 125,000
used (76%)") and, once an amount is typed, what this payment does: "After this payment: 88% used", or "This payment takes Grey
structure Rs 10,000 over its budget". From 80% the line turns amber and from 100% red, always with an icon and the words (never colour
alone); it never blocks saving. It uses the same rules as the budget alerts (`isSpent`, `budgetLevel`): only paid and advance
payments count, not planned, skipped, removed, waiting-for-approval or rejected ones, and a planned payment or a builder's entry
waiting for approval does not change the figure. The payment being edited is left out of "spent" so it is not counted twice. A phase
without a budget shows nothing. Code: `previewPhaseBudget` in `src/lib/stats.ts`. Check: `npx vite-node scripts/budget-test.ts`.

## Vendor nudge (Add payment)

When no vendor is chosen and the purpose (or the payee name) contains a vendor's name, a small blue line under the purpose says
"Ihtisham is in your vendors" with a **Choose Ihtisham** button. It is meant for the habit of writing the name into the purpose, which
leaves the vendor's total and statement short. It shows when editing too, so old entries can be fixed. Choosing works exactly like the
vendor drop-down (including picking the vendor's only open contract). Matching is by whole words and the whole name, at least three
letters ("Ali" is not found in "Salim"; "Amjad" alone does not match "Amjad Sethi"; the longest name wins); different spellings of a
name are not matched. Code: `src/lib/vendorMatch.ts`. Check: `npx vite-node scripts/vendor-match-test.ts`.

## Contract strip (Add payment)

Choosing a contract on Add payment shows a small card under it: the contract name, **which instalment this would be** (the
payments already paid or waiting for approval, plus one; new payments only), a bar, **Agreed / Paid / Remaining**, and a
line for what this payment does: "After this payment: Rs X left", "completes the contract", or a warning with an icon that
it takes the contract Rs Y **over** the agreed total (it never blocks saving). A planned payment, or a builder's entry that waits
for approval, says it does not count yet. While the purpose is empty, one button fills "Name - instalment N". The numbers come
from `summarizeContract`, so they match the contract page; `previewPayment` in `src/lib/contracts.ts` adds the "after" part
and leaves the payment being edited out of "before". Check: `npx vite-node scripts/contracts-test.ts`.

## Materials (on the payment)

There is no separate Materials list any more. A material purchase is a payment: on **Add payment**, with Category **Material**,
the form asks for the item (the old "Purpose" box, with the items bought before offered as suggestions), the **quantity**, the
**unit** (bag, kg, ton, piece, cft and more) and the **rate per unit**. The supplier is the normal Vendor field (or the shop name).

- The three boxes are tied together (`solveEntry` in `src/lib/materials.ts`). What was paid, the amount, is the figure that must
  match the ledger, so it wins: typing the amount or the quantity works out the rate. Typing the rate works out the amount, and
  then a new quantity keeps that rate. The rate is never stored; it is always amount divided by quantity.
- Quantity and unit are optional (an advance paid before delivery has none) and are stored on the payment (`payments.quantity`,
  `payments.unit`). They are kept only while the category is Material; moving the payment to another category clears them.
- The form opens on the category used last (remembered on this phone), not always on Material.
- Prices are built from payments that count (paid or advance, not removed, not waiting for approval) and carry a quantity:
  **Reports → Material prices** (last rate, change on the previous purchase, lowest, highest, average actually paid, with a
  note such as "based on 3 of 9 material payments"), **a phase's page → Materials bought**, the quantity line under a purchase
  in the ledger, and the rate comparison on **Compare projects**.
- The old Materials page is gone; `/materials` goes to Reports. The old `materials` table is kept, unused and no longer synced.
- **Moving the old list.** Dexie v8 puts each old line's quantity and unit on the payment it was created with (once, quietly, as if it
  came from the server, so nothing is re-sent). Lines with no payment, or whose payment was removed, are left behind. A backup made
  before this change is folded the same way when it is restored. On the server, `supabase/schema.sql` adds the two columns and does
  the same move once (then marks the moved lines deleted, so running the file again changes nothing). Run it once more after updating.
- Checks: `npx vite-node scripts/materials-test.ts` (prices and the three boxes), `scripts/materials-fold-test.ts` (the database
  upgrade, saving, sync mapping and an old backup), `scripts/schema-test.ts` (the server columns and the move).

## Files (`/files`)

- **Photos:** progress photos shrunk on the phone (1600 px), grouped by the day they were taken, filtered by phase.
- **Documents:** contracts, approvals, quotations, drawings and bills (PDF, images, Word, Excel; up to 15 MB each),
  filtered by phase and type. Open, save to the device, edit the details, or delete (with Undo).
- Files are stored in the same private storage as receipts, under the project folder, and download to another
  device the first time they are opened there. Needs the `project_files` table: run `supabase/schema.sql` once more.

## Corner radius

Buttons, the choice buttons (Standard / Miscellaneous, Paid / Planned ...), the mobile "+" button, the skip link, sidebar items, text fields, text areas and drop-down fields all
share one 8 px corner: the `rounded-control` utility (`--radius-control` in `src/index.css`). No button is a pill. Cards, panels and dialogs stay rounder (12 to 16 px); circles are only for avatars,
radio dots, switches, progress bars, badges and the alert count.

## Drop-downs

All drop-downs use `Dropdown` (`src/components/ui/dropdown.tsx`), written like the old native select: `<Dropdown value={x} onChange={(e) => set(e.target.value)}>` with `<option>` children, `id` and `aria-*` passed through
`Field`. It opens a rounded panel with a check mark on the chosen item, 44 px rows on phones, type-to-find, a keyboard outline and scroll arrows
on long lists. `tone="sidebar"` is for the dark sidebar and `size="sm"` for a compact field. An empty-string option is allowed (it is carried
as a marker, because Radix does not allow `value=""`). See `docs/ACCESSIBILITY.md` for what was checked.

## Home figures

The four figures on Home (Spent, Budget, Budget left, Planned) are links, not static boxes. Each has a 48 px tile (a light background of one colour and the
500 shade of that colour for the icon, 400 on a tinted dark background), and goes to the screen behind it: Spent to the Ledger, Budget and Budget left to
Phases (Budget goes to the project form while no budget is set), Planned to the Ledger filtered to planned payments (`/ledger?status=planned`). The icon is
decoration (`aria-hidden`); the label and figure carry the meaning, so the light 500-on-100 icon colours are not held to the 3 : 1 rule.

**On a phone** (below the `sm` breakpoint) the tiles are compact: a small icon beside the label instead of the 48 px tile above it, and no corner arrow
(the whole tile is the link), which makes each tile about a third shorter. The Planned tile is shown only when something is planned (with it hidden, the
figures sit in three columns on a wide screen and Budget left takes the full width on a phone). Card headings keep their link on the same line
("Manage" instead of "Manage weekly payments" on a phone; on a narrow column the link wraps under the title instead of squeezing it).

## Buttons

**One primary (solid indigo) button per screen.** On every page that is the top bar's **Add payment**. Every other action on the page (Add phase, Add vendor,
Add contract, Open project, Print, Approve, and so on) is the **secondary** style (`variant="secondary"`: light brand tint, indigo text). Exceptions, because
they are their own surface: the main button of a dialog, and the Save button of a full form page (the Add payment screen hides the top bar's Add payment so
Save is the only primary there). Destructive actions use the `destructive` style.

## Empty states

One component, `EmptyState` (`src/components/common.tsx`), for every list or page with nothing in it, following the recipe from the ClickUp
design-system study: a simple line icon (decorative, hidden from screen readers; the same icon as the screen's menu entry), a message that **names
what to do** ("Add your first vendor", not "No vendors yet"), one sentence of why in muted text, and, only when the screen has no add button of its own, one 44 px button. Screens with an add button in the page header (Phases, Vendors, Contracts, Weekly payments, Files) and the Ledger and Reports (the top bar's Add payment) show no button in the empty state, so there is one way to add, not two.
- `compact` is for a list inside a card that already has a title and an add button (recent payments, transfers, the alerts popover).
- A list with items that the filters empty gets its own message ("No payments match") with a **Clear filters** (or Clear search, Show all contracts)
  button; a list that is truly empty gets the "Add your first ..." version. The Ledger, Vendors, Contracts and Files screens do both.
- While data is still loading, screens show skeletons first, so "nothing here" never shows for a moment.
- Texts are in `src/i18n` under `<screen>.empty`, `<screen>.emptyBody`, `<screen>.noMatch`. Check any new screen in light, dark, Urdu and at 375 px.

## Settings

Six sections, each its own page: **Account** (name, role, sign-in), **Preferences** (language, theme), **Notifications**,
**Project** (details, people, danger zone), **Data and backup** (sync, backup, bin) and **About** (install, version).
On a screen 840 px or wider a menu sits beside the section (`/settings` opens Account); on a phone `/settings` is a list
and each section opens on its own with a back link. The code is in `src/pages/settings/` (`SettingsPages.tsx`,
`sections.ts`) and the reusable pieces are `SettingsSection` and `SettingRow` in `src/components/settings.tsx`.

Rules for adding a setting (from the ClickUp review, `docs` link in the project notes):
- Always use `SettingRow`: a name, one line of help, a control. For a field, pass a function so the label, the help text and
  the control are tied together for screen readers. Wide screens put the control on the right; narrow ones put it under
  the label, so a label is never cut off.
- Switches and choices apply at once; typed text that must be valid (amounts, passwords) gets a Save button.
- Say where it is stored (this device or the account) in the help line when it matters.
- `SettingRow` takes `control` (right of the label on wide screens) or `below` (full width under it, for picture choices); both can be functions that
  receive the ids that tie the control to its label and help.
- Check it in light, dark, Urdu and at 375 px.

**Deleting a project** (Settings, Project, Danger zone): one button opens a dialog (`src/components/DeleteProjectDialog.tsx`) that says what is
removed (for everyone on every device when signed in), offers **Download backup** first (an offer, not a rule; it shows "Backup downloaded" once
the file is made), and asks for the project name to be typed before **Delete this project** is enabled. A backup can be restored in Settings,
Data and backup.

**Region and format** (Settings, Preferences). Kept on the device (the `region` setting); the defaults are how the app always looked, so
nothing changes until someone chooses. Each choice shows an example of itself.
- **Week starts on** Saturday, Sunday (default) or Monday: the order of the days in the weekly payment dialog and list. Payments are
  stored by weekday number, so changing it never moves a payment.
- **Time format** 12-hour (default) or 24-hour: the reminder hour and "last synced".
- **Date format** 15 Nov 2026 (default) or 15/11/2026: every date, including printed statements and the text share.
- **Number grouping** thousands, 1,300,000 (default), or lakh, 13,00,000: every amount, the amount fields while typing, and quantities.
- **Currency** Automatic (Rs in amounts, and field labels say Rs or روپے by language, as before), Rs, PKR, or روپے (written after the number).
- **Time zone** is information: dates follow the device, reminders are sent on Pakistan time (Asia/Karachi).
- Exported CSV files keep ISO dates and plain numbers so spreadsheets read them correctly, and reminders from the server still say
  Rs with thousands (the server does not know a device's choices).
- Code: `src/lib/region.ts` (the choices, `groupNumber`, week order), `src/lib/format.ts` (`money`, `formatDate`, `formatTime`),
  `src/components/RegionSettings.tsx`. `AppProvider` hands the saved choice to those functions before anything renders. In texts,
  `{cur}` is the currency word of field labels ("Amount ({cur})"). Check: `npx vite-node scripts/region-test.ts`.

**Notifications** (Settings, Notifications, when reminders are on for the device):
- **Quick setup**: Recommended (everything), Minimal (approvals and the budget limit) or Approvals only. A hand-made mix shows
  as no preset selected and the help line says so.
- **Reminder time**: the hour of the daily reminders, 5 am to 10 pm Pakistan time (default 9:00 am). Approval alerts always
  come at once.
- **Five switches**: payments due or overdue, budget 80%, budget reached, entries waiting for approval, approved or rejected
  entries. Each applies at once and shows "Saved."; if it cannot be saved the switch goes back and says so.
- The choices belong to the device (columns `prefs` and `reminder_hour` of `push_subscriptions`). Until `supabase/schema.sql`
  is run again the screen says so and every device keeps getting everything at 9:00. Logic is in `src/push/prefs.ts` and
  `supabase/functions/send-reminders/index.ts`; the hourly schedule is in `docs/PUSH_SETUP.md`.
- To try the screen without a phone: in the `epc-dev-fakesync` setup run `localStorage.setItem('epc.fakePush','1')` in the
  browser console (development only, not in the built app).

**Account and security** (Settings, Account, when signed in):
- **Change password**: asks for the current password, the new one (8 characters or more) and a repeat. The current one is
  checked with Supabase first, so a wrong password is reported on its own field. Errors are shown inline and focus moves to
  the first field with a problem. Logic and error codes are in `src/auth/account.ts`.
- **Sign out** ends the session on this device only (`scope: 'local'`) and turns reminders off here. Your data stays on the
  server and other devices stay signed in.
- **Sign out everywhere** removes the account's reminder subscriptions, then ends every session on every device (`scope: 'global'`).
  It asks for confirmation and lists the consequences first.
- Testing without a real account: `npx vite-node scripts/account-test.ts` runs the logic against a stand-in client. For the screens, the
  `epc-dev-fakesync` entry in `.claude/launch.json` starts `scripts/fake-supabase.mjs` (a tiny fake Supabase on port 54397;
  sign in with any email and the password `oldpass12`) beside the dev server on port 5177. `GET /__log` on the fake shows what
  the app sent.

## Page colours and layout

- **Neutral greys.** Every grey in the app is neutral (red = green = blue, Tailwind's "neutral" scale), never blue-tinted slate, in both themes.
  Brand indigo (#4338CA, lightened to #8F95FF on dark) is the only hue besides the status colours. `scripts/contrast-test.ts` fails if a grey token
  stops being neutral or any text or interface pair drops below WCAG AA.
- **The content area is one white container** (`--card`; #141414 on dark): rounded like the sidebar, with a light border and a light shadow, and the
  top bar inside it. It floats on `--canvas` (#F5F5F5; #0A0A0A on dark). It uses `overflow-clip`, not `hidden`, so the sticky top bar still works.
- **Inside the container there are no shadows.** Cards, fields, buttons, pills and switches are separated by a grey border only; shadows are kept
  for things that float (drop-down lists, popovers, the phone's bottom bar).
- **An 8 px gap all round** (`--page-gap` on the body) and between the sidebar and the page, so the app floats in from the screen edges. Heights use
  `calc(100dvh - 2 * var(--page-gap))`. On phones the bottom tab bar floats the same distance in, rounded. Printing has no gap.
- **The sidebar** is a rounded (16 px) dark neutral panel (#171717) in both themes, with its own `--sidebar-*` tokens, a lighter focus ring
  (`--sidebar-ring`) and the lightened logo mark (`<BrandMark onDark />`).
- Check any new page in light and dark: text placed straight on the canvas needs 4.5:1.
- The accessibility audit and how to repeat it are in `docs/ACCESSIBILITY.md`.

## Dark mode

**Settings, Preferences, Appearance**: three picture cards (`src/components/AppearanceCards.tsx`), each with a small drawing of the app in that
theme: Same as device (follows the phone or computer, including at sunset, drawn half light and half dark), Light or Dark. The pictures use fixed
colours so each card looks the same whatever the app shows now; they are decoration and the text names the choice. Arrow keys move between the
cards and Space chooses, like the other choice buttons. The choice is
kept on that device only and applied before the first paint, so a dark page never flashes white.
- The dark palette (in `src/index.css`) was checked pair by pair for WCAG AA: 4.5:1 for text, 3:1 for field borders and
  focus rings. Indigo is lightened on dark (`#8F95FF`) and buttons use dark text on it.
- The logo has a reversed version for dark (white letters, light indigo); see `src/components/Brand.tsx`.
- Printing and PDF statements always stay on white paper, whatever the theme.
- New colours must come from the tokens (`bg-card`, `text-muted-foreground`, `text-danger` and so on), never a fixed
  colour, or they will look wrong in one of the themes.

## Builder fee options

On the Settlement screen (**Set the fee**) the fee can be: decided at the end, a fixed amount, a percentage of the
construction cost, **a fee for each phase**, or **a monthly retainer**.
- **Per phase:** each phase gets no fee, a fixed amount (earned once you mark the phase **Complete** on its page) or a
  percentage of that phase's approved cost (earned as it is paid). Settlement shows the fee phase by phase.
- **Retainer:** a monthly amount from a start date, optionally to an end date. Every month that has started counts in
  full (started 10 Sept, today 15 Nov: 3 months).
- The settings of a basis you switch away from are kept, so switching back restores them.
- Needs new columns: run `supabase/schema.sql` once more. Checks: `scripts/money-test.ts` (sections 9 and 10).

## Urdu review

The Urdu text is a draft. `docs/urdu-review/` has a spreadsheet for a native speaker (all 643 texts by screen, a glossary,
style questions) and a script that applies their corrections safely. See `docs/urdu-review/README.md`.

## Statements (`/statements`)

- A printable statement of payments for the whole project, one vendor, one phase or one contract, with an optional date
  range. Counted payments only (Paid and Advance, approved); planned payments and the builder's entries awaiting approval
  can be listed separately and are never added to the total. Totals are split by cash and bank, by who paid, and by phase.
- **Print or save as PDF** uses the browser's print (choose "Save as PDF"). It prints Urdu correctly because the browser
  draws the text. Vendor and contract statements end with signature lines (received by, signature, date).
- Also **Export CSV** and **Share** (a plain text summary). Open it from a vendor, a phase or a contract ("Statement").
- No database change needed. Check: `npx vite-node scripts/statements-test.ts`.

## Contracts (`/contracts`)

- Write down what you agreed with a vendor or contractor (name, vendor, phase, agreed amount, date). **Variations** add
  extra work or deduct from the price later, so the contract always shows the total as it stands now.
- On **Add payment**, choose the contract (it is preselected when you come from the contract page or the vendor has
  exactly one open contract). Each contract then shows agreed, paid, remaining and a progress bar.
- Only paid and approved payments count as paid; a builder's entry waiting for approval is shown separately, planned
  payments are shown as planned. Paying more than the total shows **Overpaid** and an alert in the bell.
- A contract can be marked completed or cancelled (it then no longer appears when adding payments) and reopened.
- Needs the `contracts` table and `payments.contract_id`: run `supabase/schema.sql` once more. Check:
  `npx vite-node scripts/contracts-test.ts`.

## Approval of the builder's entries

- Set your role in Settings (Investor or Builder). A **paid or advance entry the builder records** (new payment, a planned
  payment marked Paid, or a material purchase that also adds a payment) is **Awaiting approval** and is not counted in
  Spent, budgets, reports, the settlement, or the budget push alerts until the investor approves it.
- The investor sees these on Home (Approve, Reject with an optional reason, Approve all), in the alerts bell, and in the
  Ledger (filter Approval). A rejected entry goes back to the builder with the reason; **saving it again sends it for
  approval again**. Any change the builder makes to an approved entry is also checked again.
- The investor's own entries count at once. Entries from before this feature count as approved.
- Limit to know: the role is a setting on each device, so this is a working agreement between the two of you, not a lock.
- Needs the new `payments` columns: run `supabase/schema.sql` once more, and paste the updated `send-reminders` function
  (the budget alert now ignores entries that are not approved).
- Instant notifications for these events (investor told on submit; builder told on approve or reject) come from a database
  trigger: `supabase/push-triggers.sql`, step 6 of `docs/PUSH_SETUP.md`.
- Checks: `scripts/money-test.ts` (rules), `scripts/schema-test.ts`, `scripts/sync-fallback-test.ts`, `scripts/push-test.ts`, `scripts/push-trigger-test.ts`.

## Push notifications

Lock-screen reminders: payments due or overdue, budget at 80% and 100%, in the person's language. Setup is in
`docs/PUSH_SETUP.md`; it needs the `send-reminders` function and a daily schedule on Supabase.

## Not built yet (next stages)

- A push when the other person adds or changes a payment (needs a database trigger on top of the daily reminders).
- Fee per phase or monthly retainer, and approval of the builder's entries by the investor.
