# Check-ins

The Check-ins page now supports coach-defined forms and durable submission/review history. This implements the documented core form workflow, not Kahunas' private backend or all of its integrations.

## Coach workflow

1. Create a form from the starter questions or change its name and questions.
2. Choose numeric, integer rating, short-text or long-text answers. Configure required fields, numeric bounds, units, metric visibility and optional above/below attention thresholds.
3. Reorder questions and preview the client form. Save and publish it, optionally marking it as the coach's default form.
4. Assign the form to one or more approved clients. Choose a first due date, once/daily/weekly/every-two-weeks/monthly frequency, and 1–366 occurrences (30 by default). Assignments are generated immediately; no background scheduler is used. Existing historical schedules retain their dates.
5. Filter check-in history by client and submission status. Customize metric columns and view a metric trend after filtering to one client.
6. Open a check-in to inspect its answers and attention flags. Review submitted responses as On Track, Neutral or Needs Attention and leave feedback visible to the client. Review changes are retained in history.
7. Change a pending/draft check-in's due date without changing the rest of its schedule. Submitted check-ins cannot be rescheduled.

Publishing an edit creates another form version. Existing assignments retain their exact question snapshot. New assignments use the latest version. Metric history separates fields from different forms and units.

## Client workflow

Clients choose a date (today by default) to see their assigned forms and saved responses. At least one photo is required for every new submission, including previously assigned but unsubmitted check-ins. They can save incomplete drafts. Submission sends the current answers directly and validates all required fields and types on the server; a separate draft-save step is not necessary. Submitted answers and photos are immutable. A client can upload or remove photos while the check-in is pending or in draft, and can save incomplete drafts without a photo. Coach review status, notes and review time are visible on the submitted check-in.

## Storage and security

Migration `004_checkin_forms.sql` adds forms, form versions and check-in logs, and extends the existing assignment/submission tables. Existing assignments receive the original fixed questionnaire snapshot without renaming old answer keys. Existing submitted data is retained and a migration history event is created.

- `checkin_forms`: latest published definition, owner, version and default selection.
- `checkin_form_versions`: preserved definitions for every published version.
- `checkin_assignments`: client, coach, exact form snapshot, version, schedule identity and due date.
- `checkin_submissions`: draft answers, immutable submitted snapshot, numeric answer revision, attention flags, submission/review timestamps and reviewer identity.
- `checkin_logs`: append-only application history of assignment, draft saves, submission, due-date changes and reviews, with actor, time and event data.
- `audit_events`: matching security audit events in the same transaction as every API state change and history insert.

Every endpoint requires the correct role and a currently approved account. Assignment, answer updates, review and history reads recheck the approved coach/client relationship. The assignment row serializes concurrent changes. Answer and review writes require the expected revision and reject stale requests with 409; rescheduling checks the previous due date. Form edits require the current form version. Failed validation or audit writes roll back the entire operation.

## API

All paths below are under `/api/v1`:

- `GET/POST /coach/checkins/forms`: list/create published forms.
- `PUT /coach/checkins/forms/:id`: publish another version with `{definition,isDefault,version}`.
- `POST /coach/checkins`: `{formId?,clientIds,dueDate,frequency:"ONCE"|"DAILY"|"WEEKLY"|"BIWEEKLY"|"MONTHLY",occurrences,notes}`. Omit formId to use the default. Returns generated assignment IDs.
- `GET /coach/checkins`, `GET /client/checkins`: authorized history including form snapshots and answers.
- `PUT /client/checkins/:id`: save `{revision,answers}` as a draft.
- `POST /client/checkins/:id/submit`: validate and submit `{revision,answers}` atomically.
- `POST /coach/checkins/:id/review`: `{revision,status,notes}`.
- `POST /coach/checkins/:id/reschedule`: `{previousDate,dueDate}`.
- `GET /coach/checkins/:id/history`: authorized event history for a specific assignment.

The old fixed-answer write payloads are replaced by the versioned answer contract above; both app frontends have been updated. Existing historical rows remain readable. The development seed supplies a form snapshot for new sample assignments.

Video uploads, wearable synchronization, automatic reminders, indefinite recurrence, named client-group management and persistent per-coach column preferences are not included. Column choices currently last for the page session. These should not be presented as complete Kahunas feature parity.

## Validation

The PostgreSQL integration tests run in an isolated disposable schema when `DATABASE_URL` is available. They exercise the migration with existing check-in data, authorization, form version preservation, draft restoration, stale saves, required answers, immutable submissions, flags, reviews and atomic rollback when audit insertion fails. Frontend tests cover saved draft hydration, submission of unsaved changes, incomplete drafts, failure preservation and locked reviewed forms.

## Private check-in photos

Migration `005_daily_checkin_photos.sql` adds PostgreSQL-backed private photo storage and records photo IDs on submitted snapshots. `PrivateCheckinPhotoStorage` separates the storage operations from the routes. Photo bytes, metadata and matching audit records share a database transaction; there are no public files or static URLs. Include this table in protected database backups.

Clients upload JPEG, PNG or WebP images as binary `application/octet-stream` requests to `POST /client/checkins/:id/photos`. Limits are 8 MB input, 20 megapixels, 5 photos per assignment, and 20 upload attempts per minute per client. Images are fully decoded, reoriented and re-encoded to JPEG (maximum 2000 × 2000); EXIF/GPS and other source metadata are removed. Animated and unsupported formats are rejected.

`GET /{coach|client}/checkins/:id/photos` lists photo metadata; `GET /{coach|client}/checkins/:id/photos/:photoId` returns authenticated image bytes with no-store cache headers. Clients may `DELETE /client/checkins/:id/photos/:photoId` before submitting. Every route verifies the assignment owner and the currently approved relationship. Coaches have read-only access to their clients' photos. The UI fetches bytes using the in-memory access token and releases temporary blob URLs when unmounted.

The submission transaction requires at least one stored photo and freezes its photo IDs alongside the answer history. Assignment locking prevents a concurrent delete from removing the last photo from a submitted check-in. Previously submitted historical check-ins without photos remain readable.
## Same-day check-ins and schedule choices

A client can complete different assigned forms on the same due date. Each form is assigned at most once per coach/client/date through the API, independent of its version or schedule. Overlapping schedules and rescheduling conflicts return 409, rolling back the entire request. Transaction-scoped advisory locks serialize concurrent scheduling for a coach/client pair. Existing historical duplicates remain readable; no responses or photos are deleted. Each assignment still permits only one immutable submission. This limit concerns the assigned due date, not the calendar day on which a client catches up on missed check-ins.

Daily remains the default. Once, weekly, every two weeks, and monthly are also available. Monthly schedules preserve the start day where possible and clamp to month end. Environment examples, schema, and recurrence storage are unchanged.

Kahunas documents weekly/bi-weekly/monthly check-ins and separate daily habit forms: https://help.kahunas.io/en/articles/224-walkthrough-forms . Its public documentation does not specify a repeated same-form submission limit; the once-per-form/date rule is this application's product choice, not a claim of exact Kahunas parity. Selecting multiple weekdays within one schedule is not implemented.