# EPC Construction: analysis and recommendations

Date: 2026-11-22. Method: read the code (data model, sync engine, schema/RLS, permissions, edge function), ran
`tsc -b`, `npm run build` and all 40 check scripts, and looked at the signed-in Home screen of the real project
read-only. Not done: a real-phone pass, a screen-reader pass, a penetration test against the live Supabase, load testing.

## 1. Verdict

A well-structured, unusually thorough personal-scale app. The local-first design, the approval workflow and the
server-side role guard are sound, and the logic is covered by many assert scripts. The main weaknesses are process, not
code: tests are not automated, a few rough edges in sync and exports, and several features are unverified on real
devices.

## 2. Verified facts

| Check | Result |
|---|---|
| `tsc -b` | clean |
| `npm run build` | ok, 76 precache entries, 1.8 MiB |
| 40 check scripts | all pass (two need a specific localhost port, see ARCHITECTURE section 9) |
| Largest chunks | `index` 633 KB, `common` 402 KB (not gzipped figures) |
| Live Home screen | Spent Rs 619,000 of Rs 15,000,000 (4 percent); 2 attention items (a phase at its whole estimate, 4 paid payments without receipt) |

## 3. Strengths

1. **One definition of "spent"** (`isSpent`) used by totals, settlement and alerts, so approval cannot leak into numbers.
2. **Server enforces roles** (`role_guard`), and refused writes are ignored not errors, so batches survive.
3. **Honest conflict handling**: a lost edit becomes a visible, restorable notice, not a silent overwrite.
4. **Schema-tolerant sync**: new app versions work against an older database and say so.
5. **Whole-rupee money**, no floating point drift in totals.
6. **Calm budget model**: estimates not promises, finished phases never alarm.
7. **Accessibility effort** is real: contrast pairs tested, 44 px targets, focus handling, per-page titles, RTL.
8. **Release hygiene**: chunk-error recovery and autoUpdate learned from a real blank-screen incident.

## 4. Findings

Severity: **H** high, **M** medium, **L** low.

### Correctness and data

* **M. Last-writer-wins uses the client clock.** `updatedAt` is `Date.now()` on each phone and the server keeps the
  larger value. A phone with a clock set ahead can overwrite genuinely newer edits and later edits from a correct
  clock are refused. Mitigation: have the server stamp `updated_at` (or clamp client values to `now() + small slack`
  in a trigger) and use it for the comparison.
* **M. `importBackup` trusts the file.** It checks only `app` and that `projects` is an array, then clears several
  tables and writes the rows as-is (including `dirty` flags and ids). A truncated or hand-edited backup can leave the
  device half-restored. Validate shapes and fail before clearing; consider restoring in one transaction with a
  pre-restore snapshot.
* **L. Restored rows get synced.** A restore on one phone marks rows dirty and pushes them; combined with the clock
  issue above it can overwrite the other person's newer data. Warn before restoring on a signed-in device.
* **L. Settlement and fee percent use `Math.round` per phase,** so the sum of phase fees can differ by a few rupees
  from a fee computed on the total. Acceptable, but document it.

### Security

* **M. CSV formula injection.** `csvEscape` (`src/lib/format.ts:86`) quotes commas and quotes but does not neutralise
  cells starting with `=`, `+`, `-`, `@`. A builder-entered purpose such as `=HYPERLINK(...)` becomes a formula when
  the investor opens the exported ledger in Excel. Prefix such cells with `'`.
* **M. RLS is the only barrier and it is unverified against the live project.** The schema looks right, but
  `docs/BACKEND_TESTING.md` rig is not part of any routine. Run `roles-test`/`schema-test`-style checks against a copy of the real
  schema after every `schema.sql` change, and test a second, unrelated account against the live project once.
* **L. Storage has no delete policy,** so removed receipts and files stay in the bucket forever (also a privacy point
  when a project is deleted). Add a delete policy for investors and a cleanup on project delete.
* **L. Storage object ids are guessable-free but not content-checked:** any member can upload any file type under their
  project folder. Limit size and mime in the bucket settings.
* **L. Edge function test action** authenticates by calling `/auth/v1/user` on every request; fine at this scale,
  but add basic rate limiting if the project ever grows.
* **L. Role fallback.** When a project's role is not yet synced the app uses the device's own `role` setting. A
  builder who edits local storage could show investor buttons; the server still refuses the writes. Worth showing an
  "unconfirmed role" state instead of full buttons.

### Quality and process

* **H (process). Tests are manual.** 40 scripts, no `npm test`, no CI. Several silently require the right port and a
  localhost URL, and one (`sync-fallback-test`) will talk to the real project if the env var is missing. Add a runner
  that sets safe env, runs all scripts, and a GitHub Action on pull requests.
* **M. No UI or end-to-end tests.** Logic is covered; screens, dialogs and the add-payment flow are only checked by
  hand and axe. A small Playwright suite against `epc-dev-local` (create project, add payment, approval flow) would
  catch most regressions.
* **M. Large files.** `AddPayment.tsx` 837 lines, `Phases.tsx` 725, `db/actions.ts` 601, both i18n files 1253 lines.
  Split by feature; keep `en.ts`/`ur.ts` key parity checked by a script (not present today).
* **L. Bundle.** 633 KB + 402 KB main chunks. Route-level `lazy()` for Statements, Compare, Forecast, Contracts and the
  charts would cut first load on mobile data.
* **L. README drift.** README says sign-in by emailed code; the app uses passwords. It also lists Supabase sync as
  optional while `src/sync/config.ts` hardcodes the project.
* **L. Dependency versions are very new** (TypeScript 7, Vite 8, React 19.3, lucide 1.x). Fine if the lockfile is
  committed (it is); pin before upgrading and read changelogs.
* **L. Dead dependency:** `cn` (the npm package) is listed beside the local `cn` helper in `lib/utils.ts`; remove it.

### Product and UX

* **M. Receipts missing on 4 paid entries** on the live project (Home attention card). Consider making the receipt
  step more prominent for bank and large cash payments.
* **M. Single investor and single builder per project is assumed** in many places (roles, push targeting by role,
  settlement). Adding a second investor or an accountant would need rework.
* **L. Urdu text is a draft.** 876 strings, review sheet prepared, no reviewer yet. Money-word and lakh-grouping
  choices block finalising region defaults.
* **L. Phase names on live data** mix template phases with custom ones ("Brown Structure", "Electricity Meter" as
  phases rather than a vendor/item), which suggests the phase template does not fit how the builder works. Worth asking
  him what phases he actually thinks in.
* **L. Installed-app splash stays white** in dark mode (manifest limitation); high-contrast theme and a real
  screen-reader pass are still open.

## 5. Recommended next steps (in order)

1. `npm test` runner with safe env + GitHub Action (half a day; removes the biggest process risk).
2. CSV formula guard in `csvEscape` plus a unit test (minutes).
3. Validate `importBackup` before clearing anything (an hour).
4. Server-side timestamp clamp for `updated_at` (small trigger change, test with `sync-conflict-test`).
5. Run RLS checks with a second account against the live project; add storage delete policy.
6. Playwright smoke suite for add payment, approval and sync status.
7. Real-phone pass with your brother (approvals, push, receipts), then the Urdu review, then invite him.
8. Housekeeping: README, remove the `cn` package, lazy-load heavy routes, key-parity script for i18n.

## 6. Not covered by this review

Live use beyond the Home screen, the real Supabase dashboard (policies as deployed, cron job, function version),
performance on a low-end Android, backup/restore round trip with real data, accessibility with VoiceOver/TalkBack.
