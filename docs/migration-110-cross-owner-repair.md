# Migration 110: local cross-owner integrity repair

This document records the local repair of the Gate 1 canonical-deletion blocker. It supersedes the blocked candidate identity for future review, not its historical evidence. No commit, deployment, or Production installation is authorized by this document.

## Blocker and required semantics

The original deferred SECURITY INVOKER check confused an RLS-hidden personal Topic with a deleted Topic. An authenticated admin could delete another learner's canonical target, cascade away the placement, and commit while the learner's custom Topic survived.

The repaired check must reject any relevant committed structural mutation that leaves a surviving custom branch without a placement into an active canonical Library. Actual custom-content deletion remains permitted when existing authorization and foreign keys allow it. The integrity helper never deletes, repairs, or moves content.

## Reviewed authority exception

Migration 103's default for new application objects remains migrator ownership and invoker execution. This migration makes an explicit exception for one internal trigger function: `public.enforce_canonical_personal_topic_placement()` is owned by the existing non-superuser `postgres` table owner and executes as SECURITY DEFINER. It reads only four fixed public relations and raises a generic constraint exception on invalid state.

The original invoker model cannot enforce cross-owner integrity because owner RLS deliberately hides other users' rows. A migrator-owned definer has the same visibility limitation without additional privileges. A dedicated enforcement role would require new grants plus RLS policies or BYPASSRLS authority. That would expand the security surface and change the protected privilege/policy model. Reusing the existing table-owner context for a fixed, non-callable, read-only trigger avoids those changes.

This is a deliberately limited exception, not a change to the Migration 103 default. The existing postgres role has broader authority than this function needs; the security boundary is the function's fixed read-only body, lack of input parameters or dynamic SQL, empty search path, exact EXECUTE ACL, and trigger-only use. Future modifications to that body require renewed security review.

## Privileged helper contract

- Owner: `postgres`, verified non-superuser and owner of the four queried tables, without FORCE ROW LEVEL SECURITY on those relations.
- Execution: SECURITY DEFINER, empty `search_path`.
- Exact ACL: `{postgres=X/postgres}`; no PUBLIC, anon, authenticated, service_role, or migrator direct EXECUTE.
- Arguments: none. Affected row IDs originate in OLD/NEW trigger rows. Fixed schema/table checks reject unexpected trigger relations.
- Body: static SELECT queries and constraint exceptions only; no dynamic SQL, DML, repair, reassignment, authorization grant, or content-returning interface.
- Exact owner, ACL, definer flag, and search path asserted by both migration postflight and verifier.
- Existing RPCs and RLS still authorize the requested mutation before integrity enforcement. The helper can reject a write but cannot authorize one.

## Structural coverage

The Topic and placement constraint triggers remain deferred. The placement DELETE event retains OLD.personal_topic_id after canonical-node or Library deletion cascades; table-owner visibility discovers the surviving root even though the placement row has already disappeared.

Two additional deferred triggers cover Library status transitions and canonical-node Library reassignment. WHEN clauses queue checks only when status or library_id actually changes. These events use the existing Migration 104 transaction advisory lock; Migration 110 now verifies the libraries lock trigger as a prerequisite as well. No existing function or trigger is rewritten.

Placement retargeting checks both old and new roots. Child reparenting checks the resulting same-owner ancestry. Personal root deletion is permitted only when the root is actually absent; existing restrictive child/Concept foreign keys remain in force. Library deactivation or archival is rejected while a dependent custom branch survives. Library Organizer activation and deactivation without such dependencies, and deletion after legitimate dependency removal, remain permitted.

## Protected boundaries

No RLS policy, table grant, schema grant, role membership, default privilege, public RPC definition, or application/runtime file is changed by this repair. No general administrator access to learner-owned content is added. Migration 109 selection, exclusion, inheritance, preferences, candidate, session, collection, and Algorithm behavior remains untouched.

Installation performs no application-row mutation and does not scan/reconcile historical unplaced rows. The separate exact-ID historical cleanup remains outside Migration 110. Adam's canonical content is protected.

The accepted standalone-Card invariant in `migration-110-architecture-compatibility.md` remains unchanged. Topic placement is independent of future Concept-backed or standalone Front/Back content. No Concept requirement, synthetic wrapper, future storage choice, or official Concept mastery attribution is introduced. That earlier document's implementation counts and hashes describe the historical candidate; current implementation and identities are recorded here and in the repair evidence.

## Local acceptance evidence

Evidence is retained under `work/migration-110-repair/`; the blocked Gate 1 evidence remains under `work/migration-110-gate1/`.

- Revised verifier: 44 assertions pass and rollback on the repair; the exact same verifier fails on the original candidate at the mandatory authenticated cross-owner deletion assertion.
- Authenticated admin and editor same-owner/cross-owner canonical deletion is rejected. Empty-node deletion and deletion after legitimate custom removal pass. Unauthorized learner deletion remains denied.
- Actual committed deletion attempt rejects with SQLSTATE 23514; fresh readback finds canonical node, placement, and custom Topic all intact.
- Nine expanded races plus the original three races pass, including all three former failures, Library status changes, legitimate removal, and reverse ordering. No surviving invalid branches or remaining advisory locks.
- Nine ordinary transaction/rollback/fresh-readback checks pass.
- anon, authenticated, and service_role direct helper invocation each fails with SQLSTATE 42501. Ordinary cross-owner reads and writes remain blocked.
- Six negative preflight checks reject and roll back.
- Legacy installation over six synthetic Topics, five Concepts, and twelve Cards succeeds without row changes across 68 public tables.
- All 907 pre-existing catalog contracts remain identical. The only new persistent objects are the helper and four constraint triggers.

The full test ledger, final hashes, validation limits, and release-review status are in `work/migration-110-repair/REVIEW.md`. This is a local candidate for Gate 1 re-review, not release authorization.
