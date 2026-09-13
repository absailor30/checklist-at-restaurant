# Line Check — spec for the next build

Written to hand off to a fresh session. Nothing in here is built yet.

The existing 13-department checklist system stays in the repo, unused. The line
check below becomes the product. Do not delete the department code — the client
may want it back — but do not maintain two systems either.

---

## 1. Hierarchy

| Level | Position | Scope |
|---|---|---|
| L1 | Shift Manager | one outlet |
| L2 | Area Manager | notified when L1 finishes |
| L3 | General Manager | final review |

**Resolved with client:** L1 (Shift) -> L2 (Area) -> L3 (General). Kept this way to match notification flow; avoids real-world friction.

---

## 2. The flow

```
L1 completes 10 questions  →  notify L2 and L3
L2 completes 5 questions   →  notify L1 and L3
L3 completes 5 questions   →  notify L2 only
```

- **One question per page.** Q2 only appears once Q1 is answered. Same for L2
  and L3.
- **Three stations** (Station 1, 2, 3). Independently fillable: L1 can start,
  pause and resume each station separately.
- **Progress** shown as a bar and a percentage.
- Each level's set is separate. L2's and L3's five questions are placeholders —
  the client will supply the real ones.

### Timing

- **L1 window: 11:00–12:00.** Configurable.
- Not finished by **13:00–14:00** → notify L2 and L3 so they can chase.
- **L2 deadline:** respond by 14:00
- **L3 deadline:** respond by 16:00
- All times in the outlet's timezone, not the server's.

### Default tracking

L3 needs to see, over a period, **how many times each L1 or outlet failed to
complete the line check on time**. This is a reporting requirement, not just a
notification — store the miss, do not only alert on it.

---

## 3. Question types

Five types. Types 1–3 came from the client; 4 and 5 were proposed and accepted.

| # | Type | Scores 1 when |
|---|---|---|
| 1 | Yes / No | the expected answer is given |
| 2 | Yes / No — **No** requires a photo | answer matches expected |
| 3 | Yes / No — photo **always** required | answer matches expected, photo attached |
| 4 | Numeric reading with a range, optional photo | value falls within range |
| 5 | Yes / No / **Not applicable** | answer matches expected; **N/A is removed from the score entirely** |

Type 5 is important: without it, "delivery didn't arrive" scores as a failure
and drags the result below target for something nobody did wrong.

**A sixth worth offering the client:** "No" requires a written reason rather
than a photo. A photo of a clean-looking shelf proves little; "chiller 2 down,
engineer called" proves a lot.

### Correct answers vary per question

**Decided:** each question declares its own expected answer. Some questions are
phrased negatively ("Any pest activity seen?" — No is correct). Do not assume
Yes is always right.

---

## 4. Scoring

One point per question. Correct → 1, wrong → 0. N/A → excluded from both
numerator and denominator.

**Bands — Approved by client:**

| Band | Range |
|---|---|
| Exceptional | >= 98% |
| Good | 95 – 97.9% |
| Acceptable | 90 – 94.9% |
| Poor | < 90% |

Scoring logic already exists in `src/lib/scoring.ts`, with 17 tests in
`scripts/test-scoring.ts`. It handles: never-done scores 0, rejected scores 0,
out-of-range scores 0 even when approved, waived excluded, superseded readings
counted once. **Reuse it** — extend rather than rewrite.

---

## 5. Reporting

- Comparison of **daily and weekly** results.
- Dashboards per outlet and across outlets.
- Default counts per L1 and per outlet (see Timing above).
- Push notifications: **already built and working**.
- **Email: not being built now.** In-app and push only, by decision. Email needs
  an API key that cannot be set from the assistant's side. Revisit when the
  client asks.

---

## 6. What already exists and should be reused

Working and deployed at `checklist-at-restaurant.vercel.app`:

- Multi-outlet tenancy, roles as data, configurable reporting chain
- Staff sign-in by name + PIN on a shared device; managers by email + password
- Photo capture via the device camera, compressed before upload; private bucket
  with signed URLs
- Lock / unlock / escalate with mandatory comments and an append-only audit trail
- In-app notification bell and web push (no keys needed — derived from
  `APP_SESSION_SECRET`)
- Compliance scoring with per-section rollup and change against the previous day
- CSV export, print summary, owner dashboard
- Colour-blind theme; status carries a symbol and a word, never colour alone
- `scripts/verify.sh` — 8 checks: typecheck, build, scoring tests, query-shape
  lint, migrations applied twice, seeder against a real schema, all routes
  rendering, WCAG contrast in four theme variants

Database migrations 0001–0006 are applied to the live project. `photo_facing`
and `readings` columns exist for front-camera checks and multi-value equipment
readings — **the schema is there, the staff capture UI for them is not written.**

---

## 7. Open questions for the client

1. Is the L1/L2/L3 ordering correct, given Area Manager normally sits above
   General Manager?
2. Exact score bands, and whether the target is per station or per whole check.
3. L2 and L3 deadlines.
4. Does L2 answer their five questions once, or once per outlet they cover?
5. Do the three stations each need their own score, or only the overall?
6. What happens to a line check never completed at all — does it score 0, or is
   it recorded as a default and excluded from the average?

---

## 8. Later, not now

Portfolio design · interactive training programmes · menu of services ·
a marketing webpage · e-learning and interactive learning.

