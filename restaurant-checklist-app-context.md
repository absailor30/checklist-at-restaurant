# Restaurant Checklist & Audit App — Project Context

Derived from `school-checklist-app-context.md`, re-scoped for restaurants.
All decisions below were confirmed in the scoping interview and are binding
unless explicitly revisited.

## 1. What this app is

A shift-based checklist app for restaurant groups. Staff complete role- and
shift-specific checklists on a shared tablet or their own phone, optionally
capturing a live photo or a reading (e.g. fridge temperature) as proof, and
submit. Managers are notified on submission where review is required, and on
overdue items, which auto-escalate up the reporting chain. Everything is
searchable and exportable later for audit — photo, value, comment, who, when.

## 2. Confirmed decisions

| Area | Decision |
|---|---|
| Hierarchy | Fully configurable N-level chain (Staff → Manager → Manager 2 → … → Owner), stored as data |
| Tenancy | Multi-outlet from day one: one owner account, many outlets |
| Recurrence | Shift-based (Opening / Mid / Closing, outlet-configurable) |
| Proof | Per-item configurable: photo / number / text / checkbox-only, each required or optional |
| Platform | PWA (Next.js), Android wrap (TWA/Capacitor) later |
| Auth | Shared device + staff picker; each staff sets their own PIN on first use |
| Offline | Online-only for v1, built offline-ready (see §7) |
| Storage | Supabase (Postgres + Storage) behind a swappable `StorageService` interface |
| Camera | Native camera app via `capture` attribute, not in-browser capture |
| Escalation | Notify manager on overdue → auto-escalate one level up after grace period |
| Lockout | Missed item freezes (only that item); M1 unlocks with comment; after a configurable window M2 gains unlock rights too |
| Review | Per-item configurable: auto-approve vs manager approval required |
| Notifications | In-app + web push + email; Google Sheets append for logs |
| Reporting | Live dashboard + exportable audit reports (PDF/Excel) |
| Language | English only for v1, i18n-ready strings |
| Hosting | Free tiers only (Vercel + Supabase) until first paying customer |
| Demo | Real database seeded with a fake restaurant group; resettable |

## 3. Core entities

- **Organisation** — top-level tenant (the restaurant business / owner account).
- **Outlet** — a single restaurant location under an organisation.
- **User** — staff or manager, belongs to an organisation, assigned to one or
  more outlets.
- **Role** — data, not a hardcoded enum. E.g. Kitchen Staff, Service Staff,
  Bar, Shift Manager, General Manager, Owner. Carries a `level` integer used
  for escalation ordering.
- **Shift** — named, per-outlet, with start/end times. E.g. Opening 07:00,
  Mid 12:00, Closing 22:00.
- **Checklist Template** — items tied to a (role, shift) pair for an outlet or
  shared across the organisation. Admin-configurable.
- **Checklist Item** — one task. Carries its proof type, whether proof is
  required, whether manager approval is required, a due offset within the
  shift, and optional min/max bounds for numeric items.
- **Checklist Run** — the instance of a template for one outlet on one date
  for one shift. Materialised so overdue detection and reporting are simple
  queries rather than computed-on-read guesswork.
- **Submission** — one completed item within a run: value and/or photo,
  comment, who, when, status.
- **Reporting chain** — per organisation, role-to-role (or role-to-named-user)
  links defining who is notified and in what order escalation climbs.

## 4. Data model (draft)

```
organisations
  id, name, created_at,
  default_unlock_window_minutes,      -- how long an unlock reopens an item
  unlock_escalation_minutes,          -- before the next level gains unlock rights
  settings (json)

outlets
  id, org_id, name, timezone, address

users
  id, org_id, name, phone, email, role_id, pin_hash, pin_set_at,
  is_active, created_at

roles
  id, org_id, name, level (int; lower = more junior), can_review (bool)

user_outlets              -- staff can work across outlets
  user_id, outlet_id

shifts
  id, outlet_id, name, start_time, end_time, days_of_week

checklist_templates
  id, org_id, outlet_id (nullable = applies to all outlets),
  role_id, shift_id, title, is_active

checklist_items
  id, template_id, title, description, sort_order,
  proof_type (none|photo|number|text),
  proof_required (bool),
  requires_approval (bool),
  due_offset_minutes (from shift start),
  min_value, max_value, unit        -- for numeric items e.g. fridge temp

checklist_runs
  id, template_id, outlet_id, shift_id, run_date,
  status (pending|in_progress|complete|missed),
  created_at

submissions
  id (client-generated uuid),        -- see §7, enables offline + retry safety
  run_id, checklist_item_id, user_id, outlet_id, org_id,
  value_number, value_text, photo_url, comment,
  status (submitted|approved|rejected|overdue|completed_by_manager|waived),
  submitted_at, device_captured_at, reviewed_at, reviewed_by, review_note

reporting_chain
  id, org_id, role_id, reports_to_role_id (or reports_to_user_id),
  escalation_after_minutes

item_locks                -- current lock state of one item in one run
  id, run_id, checklist_item_id, org_id, outlet_id,
  state (locked|unlocked|resolved),
  locked_at, escalation_level (0 = M1 may unlock, 1 = M2 also may, ...),
  unlocked_by, unlocked_at, unlock_expires_at, unlock_comment

lock_events               -- immutable audit trail; append-only, never updated
  id, run_id, checklist_item_id, org_id,
  event (frozen|unlocked|refrozen|escalated|manager_completed|waived),
  actor_user_id (null for system events), comment, created_at

notifications
  id, org_id, user_id, type, payload (json), read_at, sent_channels, created_at
```

Every table carries `org_id`. Single shared database, multi-tenant by column,
enforced with Postgres row-level security.

## 5. Key features

### 5.1 Login and checklist retrieval
Shared device is bound to an outlet. Staff picker lists active staff for that
outlet → staff taps their name → sets a PIN on first use, enters it after →
picks the shift they are on → sees the checklist items for (their role, that
shift, that outlet, today). Session is short-lived; the device returns to the
staff picker after inactivity so the next person is not acting as the last.

### 5.2 Proof capture
Per item, one of: nothing, a live photo, a number (with bounds), or free text.
Photos use `<input type="file" accept="image/*" capture="environment">` so the
device's own camera app is used — materially better image quality than
in-browser capture. Images are compressed client-side before upload.
Freshness is enforced server-side by comparing the capture timestamp against
submission time and rejecting stale files; this raises the cost of cheating,
it does not make it impossible, and that trade-off is accepted.

File naming (storage-side readability only; retrieval is always via the
`photo_url` column, never by parsing names):
`{org_id}/{outlet_id}/{run_date}/{run_id}_{item_id}_{timestamp}.jpg`

Numeric items out of bounds (e.g. a freezer at -2°C) are flagged immediately
and notified regardless of the item's approval setting.

### 5.3 Notifications
On submission of an item where `requires_approval` is true, notify the
submitter's reviewer per `reporting_chain`. Delivered in-app always, plus web
push and email where the recipient has opted in.

### 5.4 Overdue detection and escalation
A scheduled job (every 15 minutes) finds items in today's runs whose due time
has passed with no submission, marks them overdue, and notifies the direct
manager. If still unresolved after `escalation_after_minutes`, it climbs one
level up the chain and notifies again. Escalation stops at the top role or on
completion.

### 5.4a Lockout, unlock and override

This is the accountability mechanism, and the most behaviourally sensitive
feature in the app. Rules:

**Freeze.** When an item's due time passes with no submission, that item — and
only that item — locks. The rest of the checklist stays open, so a staff member
is never blocked from doing their remaining work by one late task. A locked
item shows who can unlock it and displays a countdown to the next escalation.

**Unlock by M1.** The submitter's direct manager (the next level up the
`reporting_chain`) can unlock it. A comment is mandatory — an unlock with no
stated reason is not recorded. Unlocking reopens the item for a limited window
set by the manager at unlock time (default 30 minutes, organisation-configurable
range). When the window expires without a submission, the item re-freezes and
the escalation clock resumes. This keeps the deadline meaningful; an unlock is
a second chance, not an amnesty.

**Escalation to M2.** If a frozen item is still unresolved after
`unlock_escalation_minutes` (configurable per organisation, default 60), the
next level up gains unlock rights as well. M1 does not lose the ability to
unlock — M2 is added, not substituted. The point is to create upward visibility
and pressure, not to punish a manager who was busy on the floor. Escalation
continues one level at a time to the top of the chain.

**Manager override.** A manager with unlock rights may instead resolve the item
directly, in one of two ways, both requiring a comment:

- *Manager completion* — the manager completes the task themselves, supplying
  whatever proof the item requires. Recorded as `completed_by_manager`, stored
  and reported distinctly from a staff completion so it never inflates a staff
  member's completion rate.
- *Waived* — the task genuinely did not apply today (delivery never arrived,
  outlet closed early, equipment out of service). Recorded as `waived` and
  reported as waived, never counted as completed. Waivers are surfaced
  prominently on the owner dashboard, because a manager who waives everything
  is exactly the failure mode this app exists to expose.

**Audit.** Every freeze, unlock, re-freeze, escalation, override and waiver is
an immutable row in `lock_events` with actor, timestamp, and comment. Nothing
in this flow is editable or deletable after the fact; a correction is a new
event, not a rewrite. This is what makes the app defensible in a food-safety
inspection or a staff dispute.

**Deliberate limitation.** A determined manager can unlock and complete
everything themselves. No software prevents that. What the app guarantees is
that doing so is fully visible to the level above them, which is the realistic
control.

### 5.5 Dashboard and audit reports
Owner/manager dashboard: today's completion percentage per outlet, what is
overdue right now, out-of-bounds readings, recent rejections, and a
seven-day trend. Audit view: filter by outlet, date range, shift, role, staff,
status, free text; results show photo, value, comment, submitter and timestamp
together. Exportable to Excel and to a PDF suitable for a food-safety
inspection.

### 5.6 Google Sheets log
Each submission is appended to a configured Google Sheet as a background job
in the app itself. Owners already work in spreadsheets and this is a low-cost,
high-perceived-value feature. Implemented in-app rather than via n8n to keep
the number of systems to maintain at one.

## 6. Storage strategy

Supabase Storage for v1, behind an interface:

```ts
interface StorageService {
  upload(file: File, path: string): Promise<string>  // returns url
  getSignedUrl(path: string, ttl: number): Promise<string>
  delete(path: string): Promise<void>
}
```

Supabase free tier gives 1GB of storage — enough for a demo and one pilot
outlet, not for a paying customer base. Supabase is open source and can be
self-hosted by a client's own IT, which keeps the "they host it themselves"
option open. That option is commercially attractive and operationally
expensive; expect to end up hosting it centrally for most clients.

Images are compressed to roughly 200-400KB before upload. Uncompressed phone
photos are 3-5MB and would exhaust both the storage tier and the staff's
mobile data.

## 7. Built offline-ready, shipped online-only

v1 requires connectivity. Kitchens, cold rooms and basements have poor signal,
so offline support is likely to be needed eventually. Retrofitting it is
expensive unless the foundations are laid now, so v1 does the following at
near-zero cost:

- Submission IDs are generated on the client, not by the database.
- All write endpoints are idempotent — re-sending the same submission is a
  no-op, not a duplicate.
- All writes go through a single module, so a queue can be inserted in one
  place later.

Full offline (local database, sync queue, conflict handling) is a multi-week
piece of work and is explicitly out of scope for v1.

## 8. Tech stack

- **Frontend/backend:** Next.js (App Router, TypeScript) — one codebase for
  UI and API.
- **Database:** Supabase Postgres, with row-level security for tenant
  isolation.
- **Auth:** custom staff-picker + PIN (bcrypt-hashed) for floor staff;
  email/password via Supabase Auth for managers and owners.
- **Storage:** Supabase Storage behind `StorageService`.
- **Push:** Web Push (VAPID) — free, no third-party dependency for v1.
- **Email:** Resend free tier.
- **Scheduling:** Vercel Cron for the overdue/escalation job.
- **Hosting:** Vercel free tier.
- **PWA:** manifest + service worker; Android via TWA/Capacitor later.

## 9. Demo mode

The app ships with a seeded fake organisation ("Spice Garden", three outlets,
roughly twelve staff, two weeks of history including completed, overdue and
rejected items and sample photos). It runs against the real database and real
code paths, so a live submission during a pitch genuinely works and appears on
the manager dashboard. A reset action restores the seed for the next demo.

## 10. Explicit non-goals for v1

- No staff rostering or scheduling. Checklists attach to (role, shift) and
  staff self-select their shift at login. Restaurants already run their rota
  elsewhere and will not switch; this stays out unless a paying client demands
  it. The data model records shift and person per submission, so adding
  rostering later is a new screen, not a redesign.
- No offline mode (see §7).
- No multi-language UI (strings kept translatable).
- No n8n in the critical path.
- No payroll, POS, inventory or ordering integration.
- No iOS-specific work. Android and desktop browsers only for v1; iOS PWA
  support is weaker and is not a target.
