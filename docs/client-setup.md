# Client setup

Use **Add client** on the coach dashboard, **Edit client** beside an approved or pending client, or **Edit setup** beside a pending invitation.

All three use a four-step wizard:

1. Personal information: first/last name, email, birth date, phone and preferred weight unit.
2. Assign plan: optional informational membership, nutrition plan, published workout program and exercise-unit preference.
3. Assign form: check-in form, first date, frequency, occurrence count and optional weekdays for weekly/fortnightly schedules. The initial questionnaire remains the standard client onboarding form.
4. Review and submit: inspect selections and return to earlier steps before saving.

Creation saves a seven-day registration invitation with its setup. The coach shares the link manually. Registration creates a pending account and relationship and applies setup in the same transaction; the client chooses their own password. Existing approval requirements still control access. No emails or payments are sent.

Opening the invitation loads the invited email and prepared name. The client only chooses a password; email-only invitations also ask for their name. Successful registration signs the client in and opens their dashboard, including the pending-approval screen when applicable. If automatic sign-in fails after account creation, the page offers manual sign-in without trying to consume the invitation again. Invalid, expired, revoked, and used links cannot display the setup form.

Updating a registered client preloads their setup and current active plan assignments. The account email is read-only. Updates use a revision to reject stale edits. Changing a plan replaces its active assignment while retaining history. Choosing no membership cancels the current record. Changing check-in settings adds missing dates without deleting existing assignments, drafts, photos or submissions; overlapping dates for the same form are retained rather than duplicated. Unchanged settings do not reassign plans or generate more check-ins.

The unit choices are stored preferences for the client record, not automatic conversions of existing measurements or form fields. Welcome-pack uploads, supplement plans, separate customizable initial questionnaires/daily-habit forms, full-library access controls, and Apple Pay are not part of this implementation. Daily check-ins are available through the check-in schedule.

## Storage and validation

`007_client_setup.sql` adds invitation setup/revisions and the tenant-scoped `client_setup` table. Apply it with the repository command `pnpm --filter @coaching/api db:migrate` after building the API.

Routes under `/api/v1/coach/client-setup` require an approved coach:

- `POST /`: create an invitation with setup.
- `GET/PUT /:clientId`: read/update a related approved or pending client.
- `GET/PUT /invitations/:invitationId`: read/update an unused, unexpired invitation owned by this coach.

Every mutation and its audit record share a PostgreSQL transaction. Selected plans/forms are checked against coach ownership. Client updates lock the relationship and compare revisions; invitation edits lock the invitation, including against registration. No passwords, bearer tokens, or invitation tokens are persisted in browser storage.

Integration tests cover invitation editing, registration with setup, approval preservation, assignment persistence, tenant isolation, stale writes, non-duplication and audit rollback. Frontend tests cover navigating all steps, preserving selections, reviewing before submission, and prefilled updates.
