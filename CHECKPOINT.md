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
8. **Manager Dashboards** — L2 and L3 progressive unlock UI in `/manager`, old department UI archived.
9. **Cron Miss Logic** — 12:00 deadline logic running in `/api/cron/refresh`, respects local timezones and preserves pause reasons.

### Not yet
1. Push notifications when L1 completes, triggering L2/L3 alerts.

## Review
Staff line check: `/staff`
Manager line check: `/manager`
