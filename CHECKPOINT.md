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

Answers live in the browser for this review cut. Wire to 0007 tables next.

### Not yet
1. Persist runs/answers to Supabase (staff login already exists).
2. Apply 0007 on the live project.
3. L2/L3 views, notifications when all three stations complete.
4. Miss recording at 12:00 in outlet timezone.

## Review
Staff line check: `/staff` (home still redirects there).
Sample only — no auth required on this cut so reviewers can tap through types.
