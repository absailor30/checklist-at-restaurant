# Checkpoint — state of the project

Last updated: 2026-09-12

## Where things stand

The app is **built, deployed and working** on Vercel + Supabase. Everything
below is live, not planned:

- Staff sign-in (name picker + PIN on a shared device), manager/owner login
- Department-based checklists: 13 departments, 21 checklists, 121 checks
- Photo proof, temperature readings with min/max ranges, re-take of an
  out-of-range reading (the original is kept, never deleted)
- Freeze / unlock / escalate when an item is missed, with an audit trail
- Manager review and approval, owner dashboard, CSV export
- Compliance scoring (`src/lib/scoring.ts`), in-app notifications, web push
- Colour-blind theme, dark mode, contrast audited
- Onboarding at `/onboard`, demo data builder, health page at `/health`

Verification: `bash scripts/verify.sh` runs 8 checks (typecheck, production
build, scoring tests, embed lint, migrations applied twice, seeder against the
real schema, every route rendering, contrast in 4 themes).

## What is NOT built

1. **The L1/L2/L3 line check redesign** — specified in `LINE-CHECK-SPEC.md`,
   deliberately not started. This is the next piece of work.
2. Staff capture UI for two newer check types: multi-value equipment readings
   and selfie checks. The database columns and the API plumbing exist; the
   phone screen cannot collect them yet.
3. Importing the client's real line-check content (on hold).

## The documents

| File | What it is |
|---|---|
| `LINE-CHECK-SPEC.md` | The spec for the next build. Start here. |
| `restaurant-checklist-app-context.md` | The original spec the current app was built from. |
| `DEPLOY.md` | Deploying, environment keys, cron, themes, notifications. |
| `SETUP.md` | Plain-English guide to finding your Supabase keys. |
| `CHECKPOINT.md` | This file. |

## Starting a new chat

Open a fresh session in this repository and say:

> Read CHECKPOINT.md and LINE-CHECK-SPEC.md, then build the line check.

That is enough. Both files are in the repository, so the new session reads
them directly — you do not need to paste anything or re-explain the project.

If you only want to change the existing app rather than build the line check,
say instead:

> Read CHECKPOINT.md, then <what you want changed>.

## Three things to settle with the client first

The line check spec cannot be finished until these are answered. They are
listed in full at the end of `LINE-CHECK-SPEC.md`.

1. **The hierarchy looks inverted.** An Area Manager normally sits above a
   General Manager, not below. Confirm which way round it should be.
2. **The score bands contradict themselves.** "95% met target" and ">95%
   exceptional" both claim 95%. A number cannot be in two bands.
3. **L2 and L3 deadlines are not set.** Only L1's 11:00–12:00 window and the
   13:00–14:00 escalation were given.

## Branch

Work is on `claude/peaceful-babbage-8tyybi`, merged into `main`. Vercel
deploys from `main`.
