# CHECKPOINT.md

## Project Status

13-department checklist remains in `archive/department-checklist/`.

Current product: **L1/L2/L3 Line Check**.

### Locked with client this session
- Open spec questions parked — do not re-ask.
- **12:00 is the hard stop.** Unfinished station = miss. Pause reason stored.
- L1 sample bank: 10 questions covering types 1–6 plus hand-wash hybrid.
- Any temperature reading requires a photo.
- Hand-wash: Yes → photo, No → written reason.

### Done
1. Spec + checkpoint updated to the locked sample bank.
2. `src/lib/line-check/questions.ts` — the 10 L1 questions.
3. `src/lib/line-check/score-answer.ts` — per-question score + evidence gates.
4. `src/lib/scoring.ts` — `bandOf()` for Exceptional / Good / Acceptable / Poor.
5. `supabase/migrations/0007_line_check.sql` — questions, runs, stations, answers + seed.
6. `src/app/staff/page.tsx` — reviewable L1 flow: 3 independent stations, one
   question per page, pause with reason, photo/reason/numeric gates, live %.
7. **Database sync API** — saving runs, stations, and answers securely with photo uploads.
8. **Manager Dashboards** — L2 and L3 progressive unlock UI in `/manager`, old department UI archived. Includes 15-second live polling and local-timezone "On Time" / "Late" badging.
9. **Cron Miss Logic** — 12:00 deadline logic running in `/api/cron/refresh`, respects local timezones and preserves pause reasons.
10. **Database Push Fixed** — Migrations 0007 and 0008 foreign key bugs patched and schema deployed to production.
11. **Manager visibility fix** — `line_check_runs`/`stations`/`answers`/`questions` had RLS enabled with no policies, so the manager overview (RLS-bound client) never saw staff's admin-client writes. Added SELECT policies (`0009_line_check_rls.sql`) and the UPDATE policy L2/L3 submit needs on `line_check_runs` (`0010_line_check_runs_update.sql`). Both applied manually to production by the client.
12. **L2/L3 role gating** — L2 review restricted to `Shift Manager`, L3 to `General Manager`/`Owner`, enforced server-side in `/api/manager/line-check/questions` and `/submit` (403 if not allowed), not just hidden in the UI.
13. **Manager review UI** — L2/L3 review sheet now one question per page (Back/Next), matching staff flow.
14. **Staff Back button** — L1 question flow has a Back button (disabled on Q1); local per-station answer state means nothing is lost going back.

15. **L1 answers persist locally** — a refresh no longer loses in-progress answers (2026-09-16).
16. **L1/L2/L3 hierarchy + brand onboarding** — wizard + Excel import to provision brands, outlets and managers without code; per-outlet station count enforced in the L1 app (2026-09-18). L1 is now at `/l1` (PIN login, picker shows L1-tier accounts only).
17. **L3 reporting** — owner report rebuilt on line_check data at `/l3` (2026-09-19).
18. **Uniform response UI** — Yes/No/NA plus Comment / Media / Flag on every question for L1, L2 and L3.
19. **Sync + state-leak fixes** — photos uploaded one at a time (fixes "Failed to sync station"); `key={q.id}` stops one question's media showing on the next (2026-09-22).
20. **Corrective actions** — flagged answers auto-create an action assigned one tier up.
21. **Custom checklist builder** — L2/L3 add per-brand questions; additive, L1's static bank untouched.
22. **PDF export** for the L3 report, alongside CSV.
23. **Team management** for L3 — add/deactivate L1 staff (scoped; not a role/permission redefinition).
24. **Recurring schedule builder** — separate from the fixed daily L1/L2/L3 flow.
25. **AI photo verification** via Groq vision — advisory only, never blocks. Model swapped to `meta-llama/llama-4-scout-17b-16e-instruct` on 2026-10-03 after the old one was decommissioned.
26. **Self-signup + approval chain** (2026-09-25) — L1 requests approved by L2/L3, L2 requests approved by L3 (approved L2 gets all brand outlets), unapproved accounts see only a waiting screen. Platform admin at `/admin/pending` (password-gated by `SETUP_PASSWORD`, which can only be reset in Vercel, not read back) approves any L1/L2 across all brands. Migration `0017_l1_self_signup.sql` adds `users.approved`.
27. **Camera-only photo capture** — `getUserMedia` overlay replaces file inputs on L1 and L2/L3 media buttons, so there is no gallery/upload option.
28. **"Expected:" hint removed** from L1 questions.
29. **Manager name + role** shown under the title on `/manager`.
30. **L3 report charts** — daily compliance trend, average % by outlet, shifts by score band (inline SVG, no new dependency).

### Not yet
1. Push notifications when L1 completes, triggering L2/L3 alerts.
2. ~~Bakelore~~ — built, see "Bakelore + Android (2026-10-15)" below.
3. Offline mode for L1 — deferred, not started.
4. Not yet verified by clicking through on a real device (no browser in the dev sandbox): camera-only capture, L3 charts at phone width / dark mode, AI badge on a real capture, L2 self-signup form.

## Bakelore + Android (2026-10-15)
Production = `main` = https://checklist-at-restaurant.vercel.app, Bakelore only (Spice Garden hidden, not deleted; old main at branch `archive/main-before-bakelore`). Supabase project `mzukkujmmbqemljsmyxe`. Test logins are known to the owner and are NOT stored here; replace them, and rename "Bakelore (TEST)", before real use.

**Brand setup (org `line_check_config`):** 13 stations / 150 questions (79 need a photo), shifts Opening (`morning`) + Closing (`evening`) only; `shiftStarts` 09:00 / 17:00; `shiftDeadlines` 12:00 / 20:00; per-brand L1 bank (`line_check_questions.org_id`). Temperature questions are Yes/No/N/A + photo; "No" auto-flags, needs Comments / Corrective actions, optional after-correction photo, shown to L2/L3.

**Built since the last update**
- Per-shift deadlines; stations are marked missed on dashboard/report load (`enforceDueShifts`, today + yesterday only) because the Vercel cron runs once a day.
- L3 report insights (completion, on-time, per shift/station, top failing products, corrective actions) above the old charts.
- Reminders to L1 phones via web push: `/api/cron/reminders`, called every 5 minutes by cron-job.org (header `Authorization: Bearer <CRON_SECRET>`). Start nudges at 9:00, 9:45, 9:55 (Closing 17:00, 17:45, 17:55) to L1 while unfinished. Deadline warnings 120/60/15/5 min before 12:00 / 20:00 to L1+L2+L3 while unfinished. "Check delayed" push to L1+L2+L3 at the deadline if a check is still going; L1 can then enter a delay reason (`line_check_runs.delay_reason`, migration 0022), shown to L2 and in the L3 report. On the deadline, only never-started stations become missed; started checks stay open (delayed) and become missed the next day. Each sent once (`reminder_log`, migration 0021; deadline reminders stored as negative offsets). Env: `PUSH_CONTACT` (mailto:), `CRON_SECRET`, optional `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (else derived from `APP_SESSION_SECRET`). "Send test notification" button in the bell.
- L1 countdown timer in the last 15 minutes before the deadline (red in last 5).
- L1: "Done" is now Sign out with a warning; drafts kept on the phone; paused and completed stations reload for anyone on the same shift (`/api/l1/line-check/state`).
- L1 picker orders Opening before Closing and shows the brand's shift labels.
- Photos: camera only (no upload). Routine passing photos compressed (1280px, q0.7); failure and correction photos full quality. Files older than 60 days purged by the daily cron (`PHOTO_RETENTION_DAYS`).
- PWA manifest: Bakelore Checklist, opens `/l1`.

**Monthly L2 audit:** separate page `/manager/fssai-audit` titled "FSSAI Audit" (`/audit` redirects there; links on the manager dashboard and L3 report). One audit per outlet per month (`audits`, `audit_answers`, migration 0024); L2 fills it in and it autosaves, L3 reads it; the questions are the brand's L2 bank (Bakelore: 27 FSSAI questions in 6 sections, `l2OwnBank`; global default L2 questions hidden for that brand). Completing needs every question answered and locks it; score = yes / (yes + no).

**L3 report v2 (2026-10-15):** ranges Today / Yesterday / 7 / 14 / 30 / 60 / 90 days / All time (latest 12 months) / custom dates, plus an outlet filter (All outlets or one; "location" = the whole business, outlet = one outlet; there is no location grouping field). API `GET /api/l3/report?days=|yesterday=1|all=1|from=&to=&outletId=`, same params on the CSV/PDF exports. Charts (inline SVG, no library): KPI tiles with change against the previous equal period, outlet comparison table, completion line, temperature-failure columns, donuts (stations, shifts, failure follow-up), station x day heatmap, Opening vs Closing, stations needing attention, products failing most. Old charts kept under "Classic charts". If the insight queries fail, the table still loads.

**FSSAI audit screen:** one question per screen like the L2 review (Yes/No/N/A, Comments / Corrective actions, Media, Flag, Back/Next). The 3 temperature questions need a camera photo (or N/A); `audit_answers.photo_path/flagged` (migration 0025); photos upload via `/api/audit/photo`. Completed audits and the L3 view show a read-only list.

**Admin alias (2026-10-16):** role `Admin` (level 3, all flags) for Bakelore; username `admin` signs in on /manager, /l3 and /manager/fssai-audit and can use the L2 review, L3 review, L3 report and FSSAI audit (code checks `roleName === 'Admin'`). It has a throwaway test password: disable or replace it before real use (`update auth.users set banned_until = 'infinity' where email = 'admin@bakelore.test'` switches it off). The planned replacement is mapping each login or email to a level in the backend. The old 5 global L2 questions were deleted (with 5 test review answers); the 5 global L3 questions remain.

**Report access:** the report page `/l3` (titled "Report") and its exports are open to L2 as well as L3 and Admin. L3 and Admin see every outlet; L2 sees only the outlets assigned to them (`user_outlets`). The Report button shows on the manager dashboard for L2 and L3.

**Android app** (Bubblewrap Trusted Web Activity, project built on the owner's laptop, not in this repo): package `com.checklist.checklistify`, minSdk 24, billing off, notifications on. `public/.well-known/assetlinks.json` holds the signing fingerprint. Keep `android.keystore` and its password private and backed up; never commit it. The demo key used a weak password: make a new strong key before publishing or giving the client an APK. Updates to the web app reach the Android app automatically.

**Test plan for 2026-10-15 (not yet done):** start reminders 8:00/8:45/8:55 AM; sign out warning + resume; pause then sign in as someone else; temperature failure flow; photo quality; full timed run (decide if the 120-min first deadline reminder is right); L2/L3 screens and exports; deadline reminders; missed marking after noon.

**Known gaps / next:** the "missed completion" alert (a push when a shift passes its deadline unfinished; timing from the owner, to L1 only or also L2/L3?) is not built; the Supabase free tier (about 1 GB) will not hold photos for long, so plan Pro; offline mode; paywall/SaaS work; stronger logins; cleanup of org "ZZ TEST ORG - DELETE ME"; Supabase leaked-password protection is off.

## Review
Staff line check: `/staff`
Manager line check: `/manager`

Current URLs (2026-10-03): L1 `/l1`, L2/L3 sign-in `/manager`, L3 report `/l3`, brand setup `/setup`, platform admin `/admin/pending`. (`/staff` above is the older L1 route.)
