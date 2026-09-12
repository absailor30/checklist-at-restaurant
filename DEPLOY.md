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

You should already have run the migration files in `supabase/migrations/` in
the Supabase SQL Editor, in order: `0001_initial_schema.sql`,
`0002_rls.sql`, then `0003_lock_events_append_only_fix.sql`. If you have not,
do that first.

`0003` is required even on a database where `0001` and `0002` already ran: it
removes rules that made it impossible to delete an organisation.

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
4. Leave Application Preset, Root Directory and Build settings exactly as
   they are — Vercel detects Next.js on its own.
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

---

## If the staff screen says there are no outlets

The setup page and the staff screen read the same database, so they should
never disagree. When they do, the cause is almost always a cached response
rather than missing data.

1. Open `/health`. The last row names the server time, the Supabase project,
   and the deployment that answered. The "Outlet rows" row lists the outlets
   that connection can actually see.
2. Compare the project reference on that row with the one in Vercel's
   environment variables. If they differ, the two pages are pointing at
   different Supabase projects — fix `NEXT_PUBLIC_SUPABASE_URL` in Vercel and
   redeploy.
3. If `/health` lists the outlets but `/staff` does not, the staff screen's
   empty state prints what the server returned and when. A stale timestamp
   means a cache; a fresh timestamp with zero rows is a real query problem.
4. If an outlet shows `[INACTIVE]`, it exists but is switched off and will not
   appear to staff by design.

Counts are deliberately avoided in these checks: an exact count is returned in
an HTTP header, and a stripped header reads as zero, which is indistinguishable
from an empty database. Rows are fetched instead.

---

## The scheduled job

Locks refresh whenever someone opens a screen, so the app is never stale for a
person looking at it. The scheduled job covers the hours when nobody is
looking — overnight and between shifts — which is exactly when a missed closing
task needs to reach a manager.

### Turning it on

Nothing to configure. The job's token is derived from `APP_SESSION_SECRET`,
which the app already requires, so it works as soon as the app is deployed.
`/health` confirms it under **Scheduled job**.

Setting `CRON_SECRET` explicitly still overrides the derived token, if you would
rather manage and rotate it yourself.

To wire up an external scheduler, open `/setup`, enter the setup password, and
press **Show the scheduler details** — it prints the exact URL and header to
paste in. That is behind the setup password because `/health` is public, and
anything shown there is shown to the internet.

`vercel.json` schedules `/api/cron/refresh` once a day, at 02:00 UTC.

**The daily schedule is not a preference — it is the Hobby plan's limit, and
exceeding it breaks deployment entirely.** A schedule that would run more than
once a day is rejected by the Vercel API with `cron_jobs_limits_reached`, and
the whole deployment fails rather than just the cron. An hourly expression here
silently stopped every deployment for an hour before the cause was found.

### Getting a shorter interval than daily

Once a day is far too coarse for a missed closing task to reach anyone
usefully. Point a free external scheduler (cron-job.org, EasyCron, or a GitHub
Actions schedule) at the same endpoint every 15 minutes:

```
GET https://<your-app>.vercel.app/api/cron/refresh
Authorization: Bearer <your CRON_SECRET>
```

The endpoint is idempotent — running it more often than needed changes nothing
beyond doing the same checks again.

---

## Signing up a real restaurant

`/onboard` creates a real account: the group name, its outlets, and the owner's
email and password. It provisions the standard roles, the reporting chain,
opening/mid/closing shifts, and a starting set of checklists for every outlet,
all as ordinary editable rows.

Then `/manage` adds staff. Staff set their own PIN the first time they sign in,
so nobody else ever knows it; if someone forgets theirs, reset it there.

Staff are deactivated rather than deleted — their submissions are the audit
trail, and a record pointing at a deleted person is worth nothing in a dispute.

---

## Reports

`/owner` (owner and general manager only) shows completion per outlet, the
trend across the period, and every out-of-range reading, waiver and manager
completion. **Download CSV** exports the full record for an inspection;
**Print summary** produces a paper copy of the dashboard.

---

## Appearance

Two colour sets, chosen per device under **Appearance** on the outlet picker
and on `/health`:

- **Standard** — the default warm palette.
- **Colour-blind friendly** — blue, amber and vermillion, derived from the
  Okabe-Ito set. The adjacent pairs were checked with a colour-vision simulator
  rather than judged by eye: the worst pair separates by ΔE 13.1 under
  deuteranopia and 15.6 in normal vision.

Each can be forced to light or dark, or left to follow the phone.

In every theme, status carries a symbol and a word as well as a colour
(✓ done, ! attention, ✕ locked, ○ to do), so the app is readable to someone who
cannot separate the hues at all, and in a black-and-white printout.

## Verification

`bash scripts/verify.sh` runs the whole suite: typecheck, production build,
every migration applied twice to a throwaway PostgreSQL database, the demo
seeder's rows applied to a real schema, all routes rendered in a browser, and a
WCAG contrast check on every text node in all four theme variants.

---

## Notifications

**In the app — working now.** A bell with an unread count appears on the staff,
manager and owner screens. Managers are told when a task locks, escalates,
needs approval, or comes back out of range; staff are told when their work is
approved or sent back. It refreshes every minute.

Notifications go only to managers assigned to the outlet the work belongs to.
Telling a manager in another branch about a fridge they cannot see is how a
team learns to ignore the alerts that matter.

**Push notifications to the phone — not delivered yet.** The database table for
device subscriptions exists, but sending requires a VAPID key pair added to the
deployment as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, plus a service worker
to receive them.

**Email — not delivered yet.** Requires an email provider's API key (Resend has
a free tier) as `RESEND_API_KEY`.

Both are deliberately left until someone decides they are needed: each adds a
credential to manage and a way for the app to annoy people, and the in-app bell
covers a team that already has the app open during a shift.
