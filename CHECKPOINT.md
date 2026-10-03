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
2. **Bakelore Bakery & Café** — client sent `Bakelore_line_check21092026.xlsx`, a per-product checklist (~160 products, 13 sections, AM + PM, temp/shelf life/standard). Not built. Open questions: is it a new brand, all products as individual questions or trimmed, shorten the Product Standard text for phones. On hold until the client direction is confirmed.
3. Offline mode for L1 — deferred, not started.
4. Not yet verified by clicking through on a real device (no browser in the dev sandbox): camera-only capture, L3 charts at phone width / dark mode, AI badge on a real capture, L2 self-signup form.

## Review
Staff line check: `/staff`
Manager line check: `/manager`

Current URLs (2026-10-03): L1 `/l1`, L2/L3 sign-in `/manager`, L3 report `/l3`, brand setup `/setup`, platform admin `/admin/pending`. (`/staff` above is the older L1 route.)
