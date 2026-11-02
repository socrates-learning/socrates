# Legacy Editor authorization retirement

Local candidate based on `38cf5bd64b89d412a959d14abc97486d13ea8bd5`.
This checkpoint does not authorize a Production migration or deployment.

## Fresh inventory and approved scope

GitHub `socrates-learning/socrates` main and the current READY Vercel Production
deployment were verified at the baseline, then rechecked after implementation.
Read-only Production aggregates found two active Administrators, one active
Learner, no Editor role records, no inactive Editors, and no pending Editor
invitations or Editor metadata markers. No accounts were changed.

The fresh installed-definition inventory found 105 functions and 56 policies
with direct Editor references. These are not all authoring permissions: some
support historical owner access, Library eligibility, study settings, or trusted
maintenance. The audit therefore did not globally redefine `is_editor()`,
`is_editor_or_admin()`, or `has_socrates_role()`.

The subsequent explicit scope clarification retires every new Editor creation
path, including standalone Cards and personal Topics. Existing Editor identities
remain Editor; they are never silently converted into Learners or Administrators.
Historical owner read/edit access and existing study behavior are retained.

## Migration 140

`supabase/140_retire_editor_authority.sql` makes 76 audited function changes,
narrows 41 existing policy expressions, and adds one restrictive INSERT-only
policy for personal Topics. The exact before/after definition hashes, permitted
replacements, owners, execution grants, and policy expressions are recorded in
`tests/fixtures/legacy-editor-retirement-proof.json`.

- Official authoring, publishing, Tags, Testing Angles, Articles, Sources,
  unpublished-content access, Library organization, and official media use the
  existing active-Administrator predicate at the relevant authorization points.
- Existing Library checks, ownership checks, revision checks, row locks,
  maintenance conditions, function ownership, and execution ACLs are preserved.
- New personal Concepts, Personal Decks, Concept-backed Cards, and creation-only
  overlays are denied for every application role. New standalone Cards require
  the existing authorized Learner identity. Editor personal Topic creation is
  denied both by its creation RPC and by restrictive INSERT RLS.
- The older unbound personal-media reservation RPC also rejects new Editor
  reservations. Existing personal-asset management is unchanged. A rolled-back
  baseline test reproduces that legacy creation path before testing its denial.
- Historical personal SELECT/UPDATE/DELETE, Deck membership and renaming,
  Concept overlay updates, Card attachments, and study settings remain intact.
- There are no data updates, deletions, backfills, role conversions, new Storage
  grants, new account-provisioning paths, or changes to Migrations 138 and 139.
  Technical database identities and the independent deletion ledger are retained.

The migration is one transaction with bounded lock/statement timeouts. It
requires the trusted migration owner and installed 138/139 prerequisites. Each
changed function must match its audited input definition before replacement;
any drift aborts the transaction. It is not intended to be blindly reapplied.

`supabase/verify_140_retire_editor_authority.sql` verifies the exact installed
definitions, owners, ACLs, settings, policy predicates, active-account/Admin
helpers, and preserved shared dependencies. Negative controls prove that it
rejects a restored Editor policy, an exposed media helper, and a rewritten shared
study helper. No browser or ordinary application credential gains maintenance or
recovery privileges.

## Application boundaries

Capabilities and command dispatch deny Editor official authoring and new
personal creation. Staff-only routes require an active Administrator. Shared
Creator access remains available for historical owners, with no new creation
tools or unpublished-content authority. Existing standalone owner editing and
the owner-qualified `/study-creator` compatibility route remain available.

Server guards verify authentication before calling the authenticated-only
activity RPC, preserving signed-out redirects. Inactive accounts fail closed.
Unknown or missing application roles are not normalized to Learner. Library
context must belong to the same verified account. Database checks remain the
final authority even if a browser forges capabilities or invokes RPCs directly.

No CSS, Home component, Goal component, scheduling calculation, account-deletion
implementation, private website, Inbox, or original migration file is changed.
Historical source-preservation tests accept only the exact Creator authorization
integration through a strict hash-and-hunk projection; negative cases still
reject unrelated edits. Actual behavior tests execute unprojected source.

## Verification

Evidence directory:
`/Users/itxiermeziani/.codex/local-evidence/legacy-editor-authorization-retirement-20261101/`

- Migration 140: 102 isolated behavior checks pass, including Admin authoring,
  Article publishing, Source attribution, Editor/Learner authoring denial,
  inactive/anonymous denial, cross-owner/Library denial, historical editing,
  Learner Card/Topic creation, and movement. All 121 existing table fingerprints
  and the existing Study/Cram candidate identities, content, and order survive
  installation unchanged. Behavior mutations roll back.
- Existing personal-image SQL suite: 31 checks pass against 140, including
  ownership, Library access, save/retry, quotas, movement, and retained images.
- Existing role-management suite: 52 checks pass after 140; seven real concurrent
  role/provisioning cases pass. Existing account-deletion suite: 102 checks pass.
- Final-Administrator suite: 22 SQL assertions and 11 real deletion/demotion
  concurrency cases pass with 140 installed. Migrations 138 and 139 verifiers
  continue passing. Ordinary credentials cannot assume the recovery owner.
- Signed deletion-ledger replay passes against both an older synthetic backup
  and a restored database upgraded through 140. Corrupt evidence and ledger
  outages fail closed; retries remain safe; other receipts and public data are
  preserved. Zero remaining Admins keeps restored access blocked, with no
  automatic promotion.
- Encrypted synthetic database-plus-image recovery restores 121 table
  fingerprints and one actual PNG byte-for-byte, rejects archive tampering, and
  preserves authenticated private-image delivery. The independent hosted ledger
  is reachable and its existing append-only privilege contract passes a read-only
  aggregate check. No real ledger records were created or changed.
- Focused application/preservation run: 432 tests, 424 pass and eight historical
  failures reproduced on the unchanged baseline. No tests are skipped. The new
  Editor retirement contract and the focused authorization suite pass.
- TypeScript, relevant ESLint, and the standard optimized build pass. Build uses
  synthetic loopback Supabase configuration; generated declarations are excluded.

The eight historical failures are the pre-existing personal-loader fixture
missing `limit()`, two obsolete Learner legacy-creation expectations, Question
presentation integrity projection, learner Card integration projection, Home
StudyPlanner fingerprint, and two shared-placement source projections. They were
not weakened or repaired to make this candidate green. Baseline and candidate
failure names are preserved in the evidence comparison.

Reproduce the new application contract with:

```sh
node --import ./tests/fixtures/legacy-retirement-resolution.mjs --test \
  tests/legacy-editor-retirement.test.mjs \
  tests/legacy-personal-retirement.test.mjs \
  tests/unified-creator-foundation.test.mjs \
  tests/creator-route-authorization.test.mjs \
  tests/creator-studio-authority.test.mjs
```

Run `python3 tests/legacy-editor-retirement-db.py editor140_run_UNIQUE` using a
new lowercase-alphanumeric suffix. The runner accepts only the existing
network-isolated test container and an empty-account historical schema template,
rejects non-synthetic accounts, and never overwrites an existing database.
The unchanged recovery/concurrency suites were also run with 140 installed;
their exact local adapters and logs are retained in the evidence directory.

## Limits and later release gate

This is local implementation evidence, not a Production migration rehearsal or
live Editor browser test. Production has no Editor accounts. UI tests use actual
components with synthetic in-memory adapters, including mounted DOM tests;
Storage recovery uses local bytes and real SQL metadata rather than hosted Auth
or Storage HTTP services. No real content or learner history was used for writes.

Before a separately authorized release, reverify Production identity and zero
Editor accounts, refresh/revalidate the encrypted Production database-and-Storage
recovery point, rehearse 140 against its isolated restored copy, compare content
and study fingerprints, then run the installed 140/138/139 contracts. Any drift
in the audited definitions is a stop condition. Do not automatically reverse
database authorization changes or modify account roles to recover an app release.
