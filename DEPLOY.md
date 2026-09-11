# Putting the app online

Everything here is done in a web browser. No terminal, no laptop setup.
About 10 minutes end to end.

When you finish you will have a normal https link — send it to anyone, it
opens on any phone.

---

## Before you start

You need:

- the GitHub account holding this repository
- your Supabase project (already created)
- a Vercel account — free, and you can sign up *with* your GitHub account

You should already have run `0001_initial_schema.sql` and `0002_rls.sql` in the
Supabase SQL Editor. If you have not, do that first.

---

## Step 1 — Collect four values

Three come from Supabase, and you invent the fourth.

Open your Supabase project, click the **gear icon** (Project Settings) at the
bottom of the left sidebar, then **API Keys**.

| What | Where | Looks like |
|---|---|---|
| Project URL | API Keys page | `https://mzukkujmmbqemljsmyxe.supabase.co` |
| anon key | API Keys page | a long string starting `eyJ` |
| service_role key | API Keys page, click **Reveal** | another long string starting `eyJ` |

The fourth and fifth you make up yourself. Any long random text, different from
each other — mash the keyboard for 30+ characters each:

- **APP_SESSION_SECRET** — signs staff login sessions
- **SETUP_PASSWORD** — protects the page that creates demo data

Keep all of these somewhere private for the next step. The service_role key is
a master key to your database: never post it in a chat, a screenshot, or a
public repository.

---

## Step 2 — Deploy on Vercel

1. Go to **vercel.com** and sign up with GitHub.
2. Click **Add New → Project**.
3. Find `checklist-at-restaurant` in the list and click **Import**.
4. **Important:** under Git Branch, choose `claude/peaceful-babbage-8tyybi`.
   That is where the app lives. The `main` branch has almost nothing on it.
5. Expand **Environment Variables** and add all five, one per row:

   ```
   NEXT_PUBLIC_SUPABASE_URL        your project URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY   your anon key
   SUPABASE_SERVICE_ROLE_KEY       your service_role key
   APP_SESSION_SECRET              your long random text
   SETUP_PASSWORD                  your other long random text
   ```

   These are stored encrypted by Vercel. They are not in the repository and
   never appear in the code. This is the proper place for secrets in
   production — there is no file with a password in it.

6. Click **Deploy** and wait a couple of minutes.

You now have a link like `https://checklist-at-restaurant.vercel.app`.

---

## Step 3 — Create the demo data

Open `your-link/setup` in a browser, enter the **SETUP_PASSWORD** you chose,
and click **Create demo**.

That builds the Spice Garden demo group — three outlets, fourteen staff, eight
checklists, two weeks of history — and creates the private storage bucket that
photos go into.

It should report something like: *3 outlets, 14 staff, 24 checklists, ~1400
submissions, N locked items.*

---

## Step 4 — Try it

Open `your-link/staff` on your phone.

1. Pick an outlet — the device remembers this, you only do it once
2. Pick a staff member, for example **Ramesh Kumar** (Kitchen Staff)
3. PIN is **1234** for every demo account
4. Pick the shift you want to look at
5. Work through the checklist — take a real photo, enter a fridge temperature

To install it like a real app: in Chrome, tap the three dots → **Add to Home
screen**. It then has its own icon and opens without browser bars.

---

## Sending it to someone else

Just send the link. It works on any phone, anywhere, with no installation.

Two things worth knowing before you send it to a restaurant owner:

- Anyone with the link can open the staff picker and sign in with the demo PIN.
  That is fine for a demo and wrong for real data. Before a real customer goes
  live, staff must set their own PINs and the demo organisation should be
  deleted.
- The `/setup` page can wipe and rebuild demo data. It is password protected,
  but do not share that password.

---

## Making changes later

Every push to the branch redeploys automatically, usually within a minute.
There is nothing to rebuild or reinstall, and nobody has to update anything —
they just reload the page.

---

## If something goes wrong

**Build fails on Vercel** — open the build log and read the last error. It is
usually a missing environment variable.

**"Missing SUPABASE_SERVICE_ROLE_KEY"** — a variable did not save. Vercel →
Settings → Environment Variables, check all five are present, then
**Redeploy**. Vercel only picks up variable changes on a new deployment.

**Setup page says "Wrong setup password"** — the value in Vercel does not match
what you typed. Watch for a trailing space when pasting.

**Staff list is empty** — the demo data has not been created. Go back to
Step 3.

**Photo upload fails** — the storage bucket was not created. Re-run Step 3;
creating the bucket is part of it and is safe to repeat.
