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

### Not yet
1. Push notifications when L1 completes, triggering L2/L3 alerts.

## Review
Staff line check: `/staff`
Manager line check: `/manager`
