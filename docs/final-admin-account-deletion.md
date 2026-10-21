# Final active Administrator account-deletion safeguard

Local additive follow-up to Phase 1 commit
`6b21596a92b460300deead34daf93ca545744e7d`. Its seven files, including
Migration 138, remain unchanged. The Production base is
`3672a79b1f5a322561ec3365ebb318001c74eadb`; neither migration is authorized
for Production by this local checkpoint.

## Live requests

Migration 139 wraps `begin_account_deletion(uuid,text)`. New requests must
leave another active Administrator, using the same definition as Migration
138: an `admin` role and an `active` account-deletion state. Pending or
completed accounts cannot provide the replacement. No new role, provider
suspension rule, promotion, or role-assignment capability is introduced.

The wrapper takes Migration 138's `user_roles` SHARE ROW EXCLUSIVE lock before
account-state locks and holds it through preparation. It locks the counted
role/state rows as well, so a stale repeatable-read transaction fails instead
of counting an Administrator who has just been demoted or entered deletion.
A BEFORE STATEMENT Auth DELETE trigger takes the same role lock before the
existing row-level purge. Role assignment, initiation, receipt retry, and Auth
purge therefore use compatible ordering. Ordinary transaction errors leave
the existing retry workflow authoritative; no failed request reports success.

SQLSTATE `P1391` becomes an HTTP 403 with an actionable explanation that
another authorized active Administrator must exist. The response exposes no
other account details. The existing dialog treats it as a definite refusal:
the requester can keep the account or close the dialog. Password proof,
existing MFA assurance, origin checks, independent ledger readiness, receipt
transport, and confirmation are unchanged.

A refused request does not transition the account, issue a receipt, append a
deletion intent, remove Storage objects, or delete an Auth identity. Already
accepted pending requests retain their exact receipt rotation, inventory,
ledger-before-cleanup ordering, and completion behavior, including retries
after interruption. Migration installation changes no application records.

## Restricted recovery boundary

The original preparation body is moved without a body change into
`account_deletion_private.prepare_account_deletion(uuid,text)`. It is owned
by `postgres`, SECURITY INVOKER, and executable only by that database owner.
The new schema grants ordinary application roles no access. Browser roles,
the application service role, Auth and Storage service roles, and the
PostgREST authenticator cannot invoke or assume the owner of this operation.
The public live wrapper remains service-only and always performs the guard.

The trusted recovery CLI already accepts only explicitly named disposable
Docker databases and loopback API targets. It now calls the private core
through its database-owner SQL connection after checking:

1. The recovery snapshot came from the independently verified ledger and
   externally pinned encrypted checkpoint.
2. The account has an existing matching ledger intent with a valid HMAC and
   independently signed checkpoint receipt.
3. The target operation has the exact expected body, ownership, invoker
   setting, and owner-only permissions. Equivalent default schema ACLs after
   `pg_restore` are accepted; added grants are rejected.

The cryptographic proof is verified by the trusted operator process, not by
user metadata or a SQL session switch. The database owner is inherently
privileged; its local recovery credential must never be supplied to the
application. There is no recovery HTTP endpoint, public RPC, new service-role
grant, user-supplied flag, or session-setting override. Recovery only replays
existing deletion intents and cannot append a new one. The independent
ledger implementation and its signature/checkpoint verification are unchanged.

Older backups are supported only when the private schema is absent and the
original released `begin_account_deletion` definition matches its exact pinned
hash. Unknown contracts fail closed and require a separate review.

An older backup may restore a sole Administrator whose later deletion was
properly accepted after a replacement Administrator was added. Reconciliation
must still remove the ledger-confirmed account. If no active Administrator
remains afterward, the report is `administrator-recovery-required`, written
to `ADMINISTRATOR-RECOVERY-REQUIRED.json`, rather than `READY.json`.
`BLOCKED.json` remains, no ingress is opened, and nobody is promoted.
Restoring application availability requires a separately authorized recovery
decision. Failed or interrupted reconciliation likewise never opens access.

## Verification and limitations

Run the unchanged Migration 138 verifier and then
`supabase/verify_139_final_admin_account_deletion.sql`. The latter pins the
new definitions, grants, private schema, existing purge/fence definitions and
Auth triggers. Negative controls prove that added grants, a definer recovery
core, or disabled triggers fail verification.

The historical Migration 127 catch-all verifier assumes every later public
table uses its original generic fence. It fails on the unchanged 137/138
baseline as well as this candidate. The identical mismatch set is
`admin_inbox_messages`, `official_topic_locations`,
`personal_card_media_saves`, and `study_deck_location_selections`. No related
table, policy, or verifier is changed here. This supplemental historical check
is not reported as passing; the scoped 138/139 contracts and the existing
102 lifecycle/preservation assertions are the checks exercised for this change.

Focused application tests cover the refusal and dialog cancellation, existing
password/MFA/session requirements, receipt retries, failed cleanup, ledger
outages, forged recovery parameters, real HMAC/Ed25519 verification, encrypted
checkpoint corruption, and the zero-Administrator recovery result.

The two historical opt-in provider/image recovery fixtures now supply the
required Administrator-readiness query and explicitly assert their expected
`verified-isolated` result. Their existing assertions remain in place. Their
external service suites are not run as part of this local safeguard proof;
the focused tests exercise both readiness outcomes without hosted credentials.

`tests/final-admin-deletion-db.py account139_run_NAME` creates new databases
only in the existing network-isolated disposable container. It reproduces
the old gap, applies 139, checks the exact 138 contract, exercises eleven real
concurrent transaction scenarios and the existing 102 deletion assertions,
and compares all 121 table fingerprints, unrelated function definitions and
RLS policies. It also performs genuine pre/post-migration dump/restores,
including the restored private grants and triggers.

`tests/final-admin-deletion-recovery.mjs account139_run_NAME` then tests the
actual SQL preparation, purge, durable receipts, and recovery coordinator
against those restored synthetic databases. It uses the real ledger and
checkpoint cryptography with a disposable ledger transport. An interrupted
ledger lookup preserves the pending request for retry. All unaffected public
records, other deletion receipts and the signed ledger/checkpoint remain
unchanged. Existing official content retains the released attribution
anonymization behavior when its author is legitimately deleted.

These are local synthetic checks, not Production rehearsal or live hosted
Auth/Storage proof. The recovery integration's Storage adapter only verifies
the released idempotent removal request for an absent synthetic avatar; it
refuses removal of actual objects. The unchanged deletion suite checks media
metadata and official-content preservation, while worker tests cover Storage
failure and retry. No Production account, file, ledger record or credential
is used. Colima remains at its existing 4 GiB configuration without restart.

Before any future release, separately authorize and perform fresh database
and Storage recovery verification, isolated rehearsal of 138 then 139, and
the existing hosted-provider compatibility checks. No automatic database
rollback, account promotion, or restoration of a ledger-deleted identity is
permitted by this checkpoint.
