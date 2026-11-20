# Push notifications: setup

Reminders reach the lock screen even when the app is closed. Three things make that work: the app (already built),
a small function on Supabase that sends them (`supabase/functions/send-reminders/index.ts`), and an hourly schedule.

**What people get**
- A payment due today, and payments that are overdue (status Planned).
- "Budget 80% used" and "Budget reached", once each per project.
- At once: the investor is told when the builder submits an entry for approval, and the builder is told when it is
  approved or rejected (step 6).
- Messages arrive in the language the person chose in the app.
- Each device chooses what it wants (Settings, Notifications): a preset (Recommended, Minimal, Approvals only), one switch
  per type, and the hour of the daily reminder (default 9:00 Pakistan time). The choices are saved on the device's row
  in `push_subscriptions` (`prefs` and `reminder_hour`), so a phone and a laptop can differ.

You set this up once, in the Supabase dashboard. No command line needed.

## 1. Update the database
Run `supabase/schema.sql` once more in the SQL Editor (it adds `push_subscriptions` and `push_log`, and the two columns
`prefs` and `reminder_hour` that hold each device's choices). Run it before you paste a newer function.

## 2. Create the function
1. Supabase dashboard, **Edge Functions**, **Deploy a new function**, **Via Editor**.
2. Name it exactly `send-reminders`.
3. Delete the sample code, paste the whole of `supabase/functions/send-reminders/index.ts`, and **Deploy**.
4. Open the function's **Details** (or Settings) and switch **Verify JWT** (JWT verification) **off**. The function
   checks the cron secret or the person's sign-in itself. With it on, the daily schedule is refused.

## 3. Add the secrets
**Edge Functions**, **Secrets**, add:

| Name | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY` | the public key in `src/sync/config.ts` (`VAPID_PUBLIC_KEY`) |
| `VAPID_PRIVATE_KEY` | the private key (kept in `~/.epc-vapid-private.txt` on the Mac that generated it) |
| `CRON_SECRET` | a long random text (same file), used by the schedule below |

The private key and cron secret are secrets: never put them in the app code or in a chat with other people.
To make a new pair of keys: `npx web-push generate-vapid-keys`, then replace the public key in `src/sync/config.ts`,
redeploy the app, and turn reminders on again on each device.

## 4. Schedule it (every hour)
**Database, Extensions**: enable `pg_cron` and `pg_net`. Then in the SQL Editor (put your own secret in):

```sql
select cron.schedule('epc-daily-reminders', '0 * * * *', $$
  select net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{"action":"daily"}'::jsonb
  );
$$);
```
`0 * * * *` is the start of every hour. Each run serves the devices whose reminder hour it is in Pakistan time, so a
device that chose 7:00 am gets its reminders at 07:00 and one that chose 6:00 pm at 18:00 (devices that never chose get
9:00). Running the same command again replaces the job of that name, which is how an older once-a-day job
(`0 4 * * *`) becomes hourly. Until you do, the old daily job still serves everyone who kept 9:00 am.
To remove it later: `select cron.unschedule('epc-daily-reminders');`
A missed run (Supabase was down at that hour) is not made up later.

## 5. Turn it on, on each phone
1. Open the app. On iPhone (iOS 16.4 or later) first tap Share, then Add to Home Screen, and open it from the icon.
2. Settings, **Notifications**, **Turn on reminders**, allow.
3. Press **Send a test**. A notification should arrive within seconds.

## 6. Instant approval notifications (optional, after step 1 to 5)
Run `supabase/push-triggers.sql` once in the SQL Editor, with two placeholders replaced: the function URL
(`https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders`) and the same secret as `CRON_SECRET`. It adds a database
trigger that asks the function to send a notification when an entry becomes pending, approved or rejected. A problem
with notifying never blocks saving a payment. Update the function (paste `index.ts` again) first.

## Checks
`npx vite-node scripts/push-test.ts` (what is sent, when, and what each choice changes), `npx vite-node scripts/push-flow-test.ts` (the whole
function against a fake Supabase: who may call it, languages, reminder hours, each device's choices, once-only alerts per
device, removal of dead devices, approval events, and a database that does not have the new columns yet) and `npx vite-node scripts/push-trigger-test.ts` (the trigger SQL: which saves notify).
