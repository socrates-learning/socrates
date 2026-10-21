# Role management safeguards — Phase 1

Local candidate based on Production `3672a79b1f5a322561ec3365ebb318001c74eadb`.
Migration 138 is not approved for Production by this checkpoint.

## Authorized scope

- Repair `set_user_role_by_email` by removing the write to the nonexistent
  `user_roles.updated_at` column. Existing row IDs and creation dates survive
  assignments and no-op updates.
- Only an active Administrator can assign Administrator/Learner roles or list
  User Management accounts. Self-role changes remain prohibited.
- Serialize both existing role-writing RPCs on `user_roles` before checking the
  acting account. Lock the actor's role and active-account state until commit.
  Count active Administrators when checking demotion. A waiting actor who was
  demoted is rejected; stale repeatable-read callers fail safely rather than
  retaining old authority. The table lock does not block ordinary role reads.
- `provision_invited_learner` receives the same authorization gate. Its remaining
  body, default Library selection, membership logic and grants are unchanged.
  An isolated reproduction proved its previous check could become stale while
  waiting on an invited account, allowing a newly demoted caller to approve it.
- The User Management selector offers only Admin and Learner. Existing Editor
  and unknown values remain visible in Current role; they never default to an
  assignable role. Invalid commands produce no RPC. Failed requests retain the
  actual stored selection.
- A database INSERT/UPDATE trigger prevents all new Editor assignments, including
  privileged SQL writers and transfers of an existing Editor row to a different
  account. Existing Editor rows and authority are not converted or removed.
- Change the dormant `approved_domains.default_role` default and existing
  privileged domain defaults to Learner, then constrain that field to Learner.
  No account role is changed. No domain consumer, signup trigger or automatic
  provisioning mechanism is added. Installation rejects an unexpected existing
  public database function consuming that dormant configuration.

## Preserved boundaries

No changes to account identities, existing role rows, role vocabulary checks,
role-table RLS policies, Library memberships, authentication configuration,
Editor authoring helpers, content, history, media or learning algorithms.
No browser INSERT/UPDATE/DELETE grants are added. The internal authorization
gate and trigger function cannot be called directly by browser or service roles.
Existing service-role RPC grants are preserved, but the RPCs still require an
active Administrator identity.

Last-Administrator protection here covers role assignment/demotion through the
application's two role-management RPCs. It does not redesign account deletion,
provider account suspension or trusted database maintenance. In particular, the
existing account-deletion workflow has no last-Administrator check. Deciding
whether to restrict that separate workflow requires a separately approved review;
Phase 1 leaves its deletion ledger and recovery contracts unchanged.

The Editor application role is not removed from the database vocabulary, route
guards or official-content permissions. Retirement of that historical authority
is a separate phase. No Editor is automatically promoted or demoted.

## Verification and recovery

Run `python3 tests/role-management-db.py role_management138_run_UNIQUE` with a
lowercase alphanumeric suffix in the established network-isolated local runtime.
The runner refuses a nonempty source account template or a networked container.
It creates a new disposable database without altering the original template.

The runner reproduces the missing-column error and inactive-Admin read gap before
migration; verifies all existing rows except the intentionally normalized domain
default; fingerprints unrelated functions and all RLS policies; exercises active,
inactive, Editor, Learner, anonymous, service-key, pending-account and forged-claim
cases; checks Library and ownership restrictions; and runs real concurrent
transactions. Existing account-deletion tests run unchanged except their isolated
database guard and synthetic bucket setup, and roll back their mutations.

A real custom-format dump/restore verifies all table fingerprints, historical
Editor role retention and the installed contract. Standard full restoration
loads data before post-data triggers, so recovery requires no runtime Editor
assignment bypass. Data-only restoration into an already-migrated schema must be
reviewed separately; ordinary inserts of historical Editor rows are deliberately
rejected. Storage delivery and ledger implementations are unchanged.

`supabase/verify_138_role_management_safeguards.sql` is read-only. It checks exact
function definitions, ownership, grants, trigger installation, domain constraints
and existing account protections. Negative tests demonstrate rejection of missing
guards, exposed helpers, privileged defaults, browser writes and altered reads.

The focused Admin presentation suite retains one pre-existing navigation hash
failure, reproduced on unchanged Production with the identical actual/expected
hash pair. This candidate does not alter that unrelated navigation implementation
or weaken its assertion. Role-management behavior and its exact source-projection
checks, including negative mutation coverage, are tested separately in that suite.

Before any separately authorized Production release: verify the exact checkpoint,
current Production source, a current recovery archive, and a restored-Production
Migration 138 rehearsal. Review the domain-default normalization explicitly.
Apply only the approved migration and installed verifier, then deploy its exact
application candidate. Never automatically reverse the migration or restore old
privileged defaults following an application rollback.
