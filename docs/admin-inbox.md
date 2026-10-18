# Administrative Inbox storage

Migration 128 follows released Migration 127. It is additive and contains no seed
messages. Install and verify it before deploying the Inbox application change.
Production migration and deployment require separate authorization.

`public.admin_inbox_messages` stores the original submission (UUID, subject,
plain-text content, category, source, optional sender name/contact, optional
canonical Question and Topic references, submission time) plus Admin notes,
status, update time and an opaque revision. Question/Topic removal clears the
reference rather than deleting the message. No user, role or learning record is
changed by Inbox management.

Only active Admin accounts can read messages. The existing `is_admin()` check
includes account-deletion restrictions. Editors, Learners and unassigned accounts
receive no rows under RLS and cannot call the read or save RPCs successfully.
Anonymous callers have no access. All Admins share the administrative Inbox;
notes are private to authorized Admins, not private to one administrator.

Browser writes must use `save_admin_inbox_message`, which accepts only message
identity, expected revision, status and notes. It updates notes and status
atomically, preserves submission details, and rejects stale writes. Direct
insert, update and delete table permissions are absent. Saving is explicit; failures
retain drafts. Reloading after a conflict preserves the local draft until the
administrator discards it to review the latest saved version.

The internal creation function is
`admin_inbox_internal.create_message(subject, content, category, source,
sender_name, sender_contact, question_id, topic_id, id)`.
Only trusted SQL running with the `service_role` privilege can execute it;
its schema must remain outside the Supabase Data API's exposed schemas.
Migration 129 adds the authenticated Study submission handler described in
`study-suggestions.md`. Website Contact, anonymous submissions and email remain
disabled in this application-only candidate. Browser/service JWTs alone do not
expose this private SQL function.

Sources `website` and `study_mode` have display labels. Source keys are bounded
lowercase identifiers, allowing additional trusted integrations later without
changing an enum. Categories and statuses use the approved fixed vocabularies.
Limits: subject 200 characters, content 20,000, sender name 200, sender contact
320, and administrator notes 10,000. Content and notes render as literal text.

Focused proof: `tests/admin-inbox.sql` runs inside a rolled-back transaction on a
database named `admin_inbox128_*`. `tests/admin-inbox-http.mjs` requires the
explicit isolated loopback endpoint on port 58528 and synthetic fixture tokens.
`supabase/verify_128_admin_inbox.sql` checks installed ownership, RLS and grants
without writing data. No tests are permitted to target Production.

## Manual deletion and retention

Administrators are responsible for deleting messages when appropriate. There is
no fixed retention period or automatic deletion schedule. Resolving a message
does not delete it. Any active Admin may delete a message in any status after
explicit confirmation; unsaved edits to that message must first be saved or
explicitly discarded. Search and filters remain unchanged after deletion.

Additive Migration 131 follows 128 and 129. Number 130 remains reserved for the
unpublished Contact candidate and is not a dependency. The authenticated-only
`delete_admin_inbox_message(id, expected_revision)` RPC rechecks active Admin
authorization, locks the row and rejects deletion after a concurrent update.
It atomically removes the message, its notes and submission details. Direct
table DELETE permissions remain absent. A repeated authorized deletion of an
already absent record succeeds, allowing safe retry after a lost acknowledgement.
Other messages, educational content and learning data are unaffected.

Deleted Study submissions retain only a private technical receipt (sender UUID,
request UUID, request hash, original message UUID and submission time), with no
message body, notes, contact information, Question or Topic. This prevents delayed
Study retries from recreating deleted content and prevents deletion from resetting
the existing rate limit. These receipts are outside the Data API, have no browser
or service-role table privileges, and are removed if their Auth account is deleted.
No automatic message-retention policy or receipt-expiration job is introduced.

Account deletion behavior for messages still in the Inbox remains unchanged:
the sender association becomes NULL while the message and Admin notes remain.
Any broader privacy handling requires explicit review. Deletion removes active
Inbox content; it does not promise immediate erasure from retained backups.
Database restoration must account for messages deleted after the restored backup.
