# Line Check — spec for the next build

The existing 13-department checklist system stays in the repo, unused. The line
check below becomes the product. Do not delete the department code.

Open client questions from an earlier draft (q1–q6) are **parked**. Do not
re-ask them. Build from the locked sample bank below.

---

## 1. Hierarchy

| Level | Position | Scope |
|---|---|---|
| L1 | Shift Manager | one outlet |
| L2 | Area Manager | notified when L1 finishes |
| L3 | General Manager | final review |

**Resolved:** L1 (Shift) -> L2 (Area) -> L3 (General).

---

## 2. The flow

```
L1 completes 10 questions  →  notify L2 and L3
L2 completes 5 questions   →  notify L1 and L3
L3 completes 5 questions   →  notify L2 only
```

- **One question per page.** Q2 only appears once Q1 is answered.
- **Three stations**, independently start / pause / resume.
- Progress as a bar and a percentage.
- L2 and L3 five questions stay placeholders until the client supplies them.

### Timing

- **L1 window: 11:00–12:00.** Configurable start; **12:00 is a hard stop.**
- Station unfinished at 12:00 = miss. Pause reason is stored so L3 sees why.
- **L2 deadline:** respond by 14:00
- **L3 deadline:** respond by 16:00
- Outlet timezone, not server timezone.

Misses are stored for reporting, not only alerted.

---

## 3. Question types (locked samples)

| Kind | Behaviour |
|---|---|
| 1 `yes_no` | Yes / No. Expected answer is per question. |
| 2 `yes_no_photo_on_no` | Photo required only when the answer is No. |
| 3 `yes_no_photo_always` | Photo always. |
| 4 `numeric_photo` | Number in range. **Any temperature reading requires a photo.** |
| 5 `yes_no_na` | N/A excluded from numerator and denominator. |
| 6 `yes_no_reason_on_no` | No requires a written reason. |
| 7 `yes_photo_no_reason` | Yes requires a photo; No requires a written reason. (hand-wash) |

Expected answer is declared per question. Do not assume Yes is always right.

### L1 sample bank (same 10 on each station)

| # | Kind | Prompt | Expected |
|---|---|---|---|
| 1 | yes_no | Uniform clean, hair restrained, jewellery policy followed? | Yes |
| 2 | yes_no | Any pest activity seen in this station? | **No** |
| 3 | yes_photo_no_reason | Hand-wash station stocked (soap, paper, hot water)? | Yes → photo; No → reason |
| 4 | yes_no_photo_on_no | Floor dry, no standing water or trip hazards? | Yes |
| 5 | yes_no_photo_always | Probe-wipe sanitiser available and in date? | Yes |
| 6 | yes_no_photo_always | Allergen matrix / prep labels visible and current? | Yes |
| 7 | numeric_photo | Fridge core temp (°C). Range 0–5. | in range + photo |
| 8 | numeric_photo | Hot-hold core temp (°C). Range ≥75. | in range + photo |
| 9 | yes_no_na | Today's delivery received, checked, put away? | Yes; N/A excluded |
| 10 | yes_no_reason_on_no | All station equipment working (no breakdowns)? | Yes; No → reason |

---

## 4. Scoring

One point per question. Correct → 1, wrong → 0. N/A → excluded.

| Band | Range |
|---|---|
| Exceptional | >= 98% |
| Good | 95 – 97.9% |
| Acceptable | 90 – 94.9% |
| Poor | < 90% |

Reuse `src/lib/scoring.ts`. `bandOf()` maps a percent to a band.

---

## 5. Reporting

Daily / weekly comparison, per outlet and across outlets, default counts.
Push already built. **Email not being built now.**

---

## 6. Reuse

Deployed at `checklist-at-restaurant.vercel.app`. Staff name+PIN, manager
email+password, photo capture, lock/audit, in-app + web push, CSV, print,
colour-blind theme, `scripts/verify.sh`.

---

## 7. Parked (do not use)

Earlier open questions about L2 answering once vs per outlet, station vs
overall score, never-completed scoring, and L1/L2/L3 title order. Defaults
from CHECKPOINT.md may still inform implementation, but do not re-open with
the client unless they ask.

---

## 8. Later, not now

Portfolio design · interactive training · menu of services · marketing page ·
e-learning.
