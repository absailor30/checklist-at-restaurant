# Setup — plain English, no coding knowledge needed

You only need to do Part 1. Everything else is here so it is written down.

---

## Part 1: Get your three Supabase values

Log in at https://supabase.com/dashboard and open your project.

### Value 1 and 2 — Project URL and anon key

1. Click the **gear icon** (Project Settings) in the far-left sidebar, at the bottom.
2. Click **API Keys** (older dashboards call this section **API**).
3. You will see:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon** / **public** key — a very long string starting with `eyJ...`
4. Copy both.

The anon key is safe to share and safe to put in the app. It is designed to be
public — the database protects itself with access rules, not by hiding this key.

### Value 3 — service role key

On the same page there is a **service_role** key, hidden behind a "Reveal" button.

**This one is a master key. It bypasses every security rule.** Never put it in a
message, a screenshot, a WhatsApp, or anywhere public. It only ever goes in the
file described below, which is never uploaded to GitHub.

### Value 4 — database password

You set this when you created the project. If you have lost it:
Project Settings → **Database** → **Reset database password**.

---

## Part 2: Where to put them

In the project folder there is a file called `.env.example`. Make a copy of it
named exactly `.env.local` (note the leading dot) and fill in your values:

```
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

`.env.local` is listed in `.gitignore`, so it never leaves your computer and
never reaches GitHub. That is deliberate — it is the single most important
security rule in this project.

---

## What to paste to me

Only these two, and only when asked:

- the **Project URL**
- the **anon key**

Do NOT paste the service_role key or the database password to me or to anyone.
If you ever paste a service_role key somewhere by accident, go to
Project Settings → API Keys and roll (regenerate) it immediately.

---

## Part 3: Running the app (later, when there is an app to run)

```
npm install
npm run dev
```

Then open http://localhost:3000 in a browser.

To use it on your phone on the same wifi, run `npm run dev -- --host` and open
the address it prints on your phone.
