# CHECKPOINT.md

## Project Status

The original 13-department checklist application is **archived but preserved** (moved to `archive/department-checklist/`). 

The current priority is building the new **L1/L2/L3 Line Check** as the main product.

### ✅ What's Done
1. **L1/L2/L3 Spec Updated**: `LINE-CHECK-SPEC.md` was updated with the client's locked-in decisions:
   - Hierarchy: L1 (Shift) → L2 (Area) → L3 (General)
   - Scoring Bands: Exceptional (≥98%), Good (95–97.9%), Acceptable (90–94.9%), Poor (<90%)
   - Deadlines: L2 (14:00), L3 (16:00).
2. **Old UI Archived**: The staff flow and endpoints were moved out of `src/` into `archive/department-checklist/`.
3. **Scoring Engine Prepared**: `src/lib/scoring.ts` now calculates and returns the new bands for all section and overall scores. Tests are passing.

### ⏳ Not Yet Implemented (Next Session's Focus)
1. **Database Migration `0007_line_check.sql`**: Needs to define `line_check_questions`, `line_check_runs`, `line_check_answers`. 
2. **Staff UI (L1)**: Build the Station 1/2/3 interface. **Requirement**: Stations must be independently pausable and resumable. A manager can stall Station 1 (e.g., for repairs) and move to Station 2 or 3 without losing data.
3. **L2/L3 Views**: Approval logic, notifications, and dashboard.

## 4 Open Questions to Proceed With (With Defaults)
The previous session proposed these defaults. If acceptable, build them:
1. **Notification firing**: Notify L2/L3 when *all three stations* complete, but show paused/blocked stations on L2's dashboard immediately so they know why a run is stalling.
2. **Reopening stations**: L1 can reopen a `complete` station to fix things *until* L2 responds; after that, it locks (using existing lock/audit mechanics).
3. **Open Spec Questions (q4-q6)**: L2 answers once per outlet; per-station and overall scores are tracked; a never-completed check scores 0 and is reported as a default.
4. **Paused at deadline**: A station paused past the 12:00 deadline counts as a miss, but the "paused/blocked" reason is recorded so L3 sees *why* it was missed.

## Recommended Next Steps
1. Create `supabase/migrations/0007_line_check.sql`.
2. Build the new `src/app/staff/page.tsx` for the Line Check flow.
