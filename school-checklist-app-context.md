# School Checklist & Audit App — Project Context

## 1. What this app is

A checklist app for schools. Teachers complete role/class-specific checklists, capture a live photo as proof of completion, and submit for review. Next-level staff (senior teacher / POC / principal) get notified on submission and on overdue items. All submissions are searchable/reviewable later with photo + comment shown together, for audit purposes.

## 2. Core entities

- **School** — top-level tenant. Each school will eventually host its own storage (see Storage section).
- **User** — a teacher or reviewer. Has a role.
- **Role** — determines which checklist applies. Examples: Class Teacher, Maths Teacher, PT Teacher, etc. (extensible list, not fixed enum — store as data, not hardcoded).
- **Class** — e.g., "5A", "8B". A teacher may be tied to one or more classes depending on role.
- **Checklist Template** — a set of checklist items tied to a (role, class-level) combination. Admin-configurable, not hardcoded in app code.
- **Checklist Item** — a single task within a template (e.g., "Homework check", "Attendance marked").
- **Submission** — one teacher's completed instance of a checklist item: photo, comment, timestamp, status.
- **Approval chain** — defines who reviews whose submissions (e.g., class teacher → senior teacher → principal). Should be configurable per school, not hardcoded.

## 3. Data model (draft — refine during build)

```
schools
  id, name, storage_config (json: which backend, credentials ref, root folder)

users
  id, school_id, name, email, role, created_at

classes
  id, school_id, name (e.g. "5A")

user_classes (many-to-many: teacher can be tied to multiple classes)
  user_id, class_id

checklist_templates
  id, school_id, role, class_level (nullable if role isn't class-specific), title

checklist_items
  id, template_id, title, order, due_time (optional, for delay detection)

submissions
  id, checklist_item_id, user_id, class_id, school_id,
  photo_url, comment, status (submitted/reviewed/overdue), 
  submitted_at, reviewed_at, reviewed_by

approval_chain
  id, school_id, role, reports_to_role  (or reports_to_user_id for named POC)
```

Every table carries `school_id` — single shared database, multi-tenant by column, not separate DBs per school (simpler to build and maintain; revisit only if schools require hard data isolation).

## 4. Key features

### 4.1 Checklist retrieval
- Teacher logs in → app determines their role + class(es) → pulls the matching `checklist_template` + its `checklist_items`.
- This is a simple filtered query. No workflow engine needed.

### 4.2 Photo capture
- In-app camera (not gallery upload — must be live capture, per requirement) tied to a specific checklist item.
- On capture: upload to storage backend (see Storage section) → get back a URL → save as a `submissions` row with checklist_item_id, user_id, comment, photo_url, timestamp.
- Naming convention for the file itself (for storage-side readability only — the app never relies on parsing this to retrieve data):
  `{school_id}_{class}_{role}_{checklist_item_id}_{date}_{timestamp}.jpg`
- Actual retrieval is always via the database record (`photo_url` field), never by parsing filenames.

### 4.3 Submission notification
- On submit → look up `approval_chain` for that role/school → push notification to the reviewer (next-level teacher/POC/principal).
- Use a push notification service (Firebase Cloud Messaging or OneSignal — both have usable free tiers).

### 4.4 Delay / overdue notification
- Scheduled job (runs periodically, e.g. every 15–30 min) checks `checklist_items` with a `due_time` where no matching `submissions` row exists yet for that day.
- On finding overdue items → notify the reviewer chain with specifics: which teacher, which class, which item is not completed.
- Implement as a cron job in the backend framework (e.g. node-cron, Celery beat, Laravel scheduler) — this is core app logic, not n8n's job.

### 4.5 Review / audit search screen
- Filter UI: dropdowns for class, teacher, role, date/date range + free-text search.
- Backend: a filtered query endpoint, e.g. `GET /submissions?class=5A&role=maths&date=2026-09-01&search=keyword`.
- Results render photo (via `photo_url`) + comment + submitter + timestamp + status together in one view.
- This is standard CRUD/search, not a workflow tool's job.

## 5. Storage strategy

- **Development/testing phase:** personal Google Drive (5TB available), via Google Drive API. Upload returns a file ID/link, which is stored in the `submissions.photo_url` field.
- **Production/school rollout:** each school hosts its own storage (their own Google Workspace/Drive, or equivalent). This must NOT be hardcoded — build storage access behind an abstraction:
  ```
  interface StorageService {
    upload(file): Promise<url>
    get(url): Promise<file>
  }
  ```
  Swappable implementation per school, configured via `schools.storage_config`, not baked into app code. Standardize on Google Drive as the default backend for all schools (avoid building multi-provider flexibility unless a specific school requires a different backend).
- Do not build a database around Drive as the source of truth — Drive/any storage backend only stores files; all queryable metadata (who, when, which item, comment, status) lives in the app's own database.
- Long-term archival: photos older than an agreed retention window (e.g. 6–12 months) can be moved to cold storage; recent/active photos must stay in fast, reliably available storage.

## 6. n8n's role (explicitly limited)

n8n is NOT the app backend and does NOT replace any of the core features above. Its only confirmed use case in this project:

- **Reporting pipeline:** on submission (webhook trigger) or on a schedule, push submission data into a Google Sheet for reporting/export purposes, decoupled from the core app so it can be modified without redeploying app code.
- Do not route core app logic (checklist retrieval, photo capture, notifications, search) through n8n — these belong in the app's own backend.

n8n hosting reference (for this reporting pipeline only):
- Currently self-hosted via Docker on a Windows laptop, WSL2 backend, Docker Desktop disk image relocated to D: drive.
- n8n container run with a persistent named volume (`n8n_data`) so workflow/credential data survives container recreation and version upgrades.
- Set `--restart unless-stopped` on the container to survive Docker Desktop restarts.
- Planned migration path: same Docker setup will move to an Oracle Cloud Always Free ARM VM (2 OCPU / 12GB RAM, currently free tier limit as of 2026) for 24/7 uptime — Docker commands/compose are portable, no rebuild needed.
- Self-hosted community edition license key activated (free lifetime key from n8n signup flow, unlocks some paid-tier features at no cost).

## 7. Tech stack — open decisions

Not yet decided; to be filled in once chosen:
- Mobile app framework (React Native / Flutter / native) or web app (PWA — relevant since camera + notifications both need to work reliably on mobile).
- Backend framework/language.
- Database (Postgres recommended given relational structure above).
- Push notification service: Firebase Cloud Messaging or OneSignal.
- Auth: role-based, needs to support teacher vs reviewer/principal permission levels.

## 8. Explicit non-goals / things ruled out during scoping

- Do not use n8n as the core app backend or for checklist retrieval/search logic — ruled out, this is standard CRUD.
- Do not rely on photo filenames as the retrieval mechanism — always use database records.
- Do not build multi-storage-provider flexibility upfront — standardize on Google Drive unless a school explicitly requires otherwise.
- Do not run production workloads (Docker/n8n) off a spinning external HDD — use SSD or a proper VPS for anything live; HDD is for backups/cold archive only.
