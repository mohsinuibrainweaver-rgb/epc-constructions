# Connect EPC Construction to Supabase

This takes about 20 minutes. You do the clicks in Supabase; the app code and the database schema are
already written. Dashboard labels change now and then: if a menu name differs, use the search box
at the top of the Supabase dashboard.

You will end with: you and your brother signed in on your own phones, seeing the same project, with
receipt photos stored privately and changes arriving on the other phone within seconds.

## 1. Create the project

1. Go to <https://supabase.com> and choose **Start your project**. Sign up with email or GitHub.
2. Create an **organization** (any name) on the **Free** plan.
3. Choose **New project**:
   - Name: `epc-construction`
   - Database password: press **Generate**, and save it in your password manager. The app never needs it.
   - Region: the closest to Pakistan (Mumbai if listed, otherwise Singapore).
4. Wait about two minutes until the project is ready.

## 2. Create the tables

1. In the left menu open **SQL Editor** and choose **New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it into the editor, and press **Run**.
3. You should see "Success. No rows returned". Running it twice does no harm.

This creates the tables, the rule that only members of a project can read or change its data, the private
`receipts` photo bucket, and live updates.

## 3. Turn off email confirmation

You and your brother sign in with an email and a password, so no emails need to be sent.

1. In Supabase open **Authentication**, then **Sign In / Providers**, then **Email**.
2. Turn **Confirm email** **off** and press **Save**.

(Emailed sign-in codes can be added later if you want them. Your data stays as it is.)

## 4. Connect the app

1. In Supabase open **Project Settings → API** (also called **API Keys**). Copy the **Project URL** and the
   **anon / publishable** key. Never use the `service_role` or secret key.
2. Open `src/sync/config.ts` in this folder and paste the two values between the quotes:

   ```ts
   export const SUPABASE_URL = 'https://your-project-id.supabase.co'
   export const SUPABASE_ANON_KEY = 'your-anon-key'
   ```

   Pasting these into the file is fine: they are not secrets. **Do not** put passwords or the secret key anywhere
   in the code. (If you prefer, use a `.env.local` file as described in `.env.example`; it wins over the file.)
3. Start the app and sign in:

   ```bash
   npm run dev
   ```

   On the sign-in screen choose **Create account** the first time (your email and a password of at least 6
   characters), then **Sign in** after that. Data already on this device uploads the first time, and you become
   the project's first member.

## 4b. Update the database when new features arrive

`supabase/schema.sql` always holds the full, current schema and is safe to run again. After an update that
adds features (the weekly payments, advances and settlement added tables and columns), open it in
**SQL Editor → New query**, paste the whole file and press **Run** once. Until you do, the app keeps working and
syncing everything else, and Settings shows a note naming what the server still needs; changes that use the
new parts wait on the phone and are sent after you run the file.

The easiest way: in the app open **Settings → Data and backup**. When the server is missing something, a note appears
there with a **Copy the update SQL** button. Press it, open **SQL Editor → New query** in Supabase, paste, and press **Run**.
(The bank details of a transfer added four columns: `payments.bank_name`, `payments.bank_account`, `payments.bank_ref`
and `vendors.bank_name`.)

## 5. Invite your brother (or the builder)

After running the updated `supabase/schema.sql` (step 4b), invitations are one-time codes:

1. Open the project, then **Settings → Project → People on this project**. Choose his role (Builder or Investor) and press
   **Create invite code**.
2. Press **Send on WhatsApp** (or **Copy code**) and send it to him. A code works once and ends after 7 days. No email is sent.
3. He opens the app, creates his account (or signs in), chooses **Join with a code** and enters it (or opens the link in your message).
   The project appears after the first sync, and he has the role you chose.

A builder sees everything in the project but cannot change the budget, contracts, advances or the project itself, and his paid
entries wait for your approval. See "Roles in a project, and invitations" in the README.
## 6. The app online (done)

The app is live at <https://epc-construction.vercel.app> (Vercel account `isometric.mohsin@gmail.com`).
Open that address on a phone, sign in, then use **Add to Home Screen** (iPhone: Share, then Add to Home Screen;
Android Chrome: menu, then Install app). Password sign-in needs no change in Supabase. The **Site URL** setting
(Authentication → URL Configuration) only matters if you later switch on emailed links or codes; then set it to
this address.

To publish a new version after changing the code:

```bash
npx vercel@latest deploy --prod --yes
```

Sign in to Vercel as `isometric.mohsin@gmail.com` first (`npx vercel@latest login`).

## Optional hardening

A new account sees nothing without an invite code, so closing sign-ups is optional. If you want to, turn off **Allow new users to
sign up** (Authentication → Sign In / Providers) after everyone who needs an account has one.

## How sync behaves

- Everything is saved on the phone first, so it works with no signal. Changes are sent when you are online.
- A small chip in the header shows Synced, Syncing, or how many changes are waiting.
- If you both edit the same row, the most recent edit wins. Deleted payments go to the bin and can be restored.
- Receipt photos are uploaded to private storage and downloaded on the other phone the first time they are shown.
