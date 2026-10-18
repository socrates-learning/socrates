# Study Mode suggestions

Phase 3 adds an optional dialog beside Flag in Study Mode. It is not learning feedback and is not shown in Cram Mode. Opening, canceling, submitting and retrying it never call study-attempt, session, selection, mastery or flag writers.

The form accepts Content Correction, New Topic, Feature Suggestion or Other, and a message of 1–4,000 characters. Its privacy explanation distinguishes official Questions from personal Cards. Only the explicitly entered message and approved official references are shared. Personal Card identifiers/content, personal notes, answers, email addresses and unrelated history are never copied.

## Server and database boundary

`POST /api/study/suggestions` uses existing cookie authentication, a verified Supabase `getUser()` result, active-account checks, same-origin validation, bounded JSON input and fixed allowed fields. The caller cannot provide a sender, Topic, source, subject, status, notes or timestamp. The existing protected-route proxy is unchanged. Signed-out requests may be redirected by that proxy; the client rejects redirects and never treats a login page as a successful submission.

The server uses the existing server-only `SUPABASE_SERVICE_ROLE_KEY`. No new browser credential or database user is needed. It calls the service-only `submit_study_suggestion_internal` function, which delegates creation to Migration 128's private `admin_inbox_internal.create_message` function. Authenticated and anonymous database roles cannot execute the submission function or insert into the Inbox directly. No GET endpoint exposes messages to the learner. The response contains only the message ID and submission timestamp.

Migration 129 follows 128 without modifying it. It adds the private authenticated sender association, client request key and SHA-256 request fingerprint to the same Inbox table, plus an index and uniqueness constraint. Its atomic function:

- Rechecks the existing approved role, active-account/deletion fence and active Library access.
- Reuses the existing published official Question authorization contract. For a Question with multiple placements, it chooses one canonical Topic in the authorized Library in deterministic ID order; no private or client-supplied Topic is accepted.
- Creates a New message with source `study_mode`, server timestamp, generated subject and empty administrator notes.
- Serializes submissions per sender, allowing at most five new messages in ten minutes and twenty in 24 hours. Retrying an already saved request does not consume quota and still works at the limit.
- Returns the same receipt for the same sender/request/payload. A changed payload with the same request key is rejected. Separate intentionally submitted requests remain separate messages.

The client freezes the request identity and payload before sending, suppresses duplicate clicks and retains the same request after an uncertain network failure, including closing/reopening the dialog on the same Question. A definite rejection preserves editable form text. An uncertain request must be retried unchanged. This draft is in memory only; it is not persisted across browser refresh or leaving the Question.

Inbox reads and management remain Admin-only under the existing RLS and functions. The private sender association is set to NULL when its Auth identity is deleted; no automatic copy of name or email is kept. Messages still in the Inbox retain their existing account-deletion behavior, including text a sender deliberately entered. Under Adam's approved policy, active Admins may manually delete messages in any status; there is no fixed retention period or automatic purge.

Migration 131 adds confirmed Admin deletion. Its private, content-free receipts preserve the original submission result and quota after deletion, so retrying an acknowledged or uncertain Study request cannot recreate the removed message. Matching retries return the original receipt; changed payloads remain rejected. No message text, notes, sender contact, Question or Topic is retained in those receipts. They are not readable through the Inbox or Data API, and Auth deletion removes them. Existing messages and account-deletion privacy handling are otherwise unchanged. See `admin-inbox.md`.

## Local verification and release boundary

Use synthetic accounts and the isolated `admin_inbox128_suggestions129` database. `tests/study-suggestions.sql` rolls back its fixtures. `tests/study-suggestions-http.mjs` is guarded to loopback port 58529 and this exact disposable database; it leaves explicitly synthetic test accounts/messages for inspection. Focused Node tests cover the server boundary, dialog, retries and exact StudyPlanner preservation. The read-only installed contract is `supabase/verify_129_study_suggestions.sql`.

Production requires separately approved application deployment and Migration 128 followed by 129 and 131. Migration 130 belongs to the unpublished Contact candidate and is not required. Missing schema or server configuration fails closed. Public website Contact Us, anonymous submissions and email delivery remain disabled. No Production migration or deployment is authorized by this local implementation task.
