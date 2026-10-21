# Legacy personal content creation retirement

Local candidate based on `202fb3c1288eaa60701565b43cd5399b2a56b757`.
No Production migration, deployment, data conversion, deletion or reassignment is included.

## Product and compatibility contract

- Admins and Learners cannot create new personal Concepts, Personal Decks or Concept-backed Cards.
- Learners continue creating standalone Cards and organizing them through authorized official or owned personal Topics.
- `/study-creator` remains the historical read/edit interface. Creator Studio displays its navigation only when the current owner has historical Concepts, Concept-backed Cards or Personal Decks. Topic-only and standalone-only accounts do not receive this link.
- Existing staff owners can reach their historical records; staff without them retain the canonical Creator redirect. New official content remains in Creator Studio.
- Historical Concept explanations, source references and overlays, legacy Card edits, Deck renaming and membership editing remain available. Nothing is converted automatically.
- Existing legacy Editor creation permissions remain unchanged, as explicitly required. This is an intentional exception until a separately approved Editor retirement. The compatibility page supplies editing controls, not new Editor authoring tools.
- Existing unsaved-change navigation protection remains in use.

## Migration 137

`137_retire_legacy_personal_creation.sql` requires the existing ownership/account fences, role helpers, Migrations 135/136 and the exact approved overlay-creation definition.

Three restrictive, authenticated INSERT-only policies intersect with the existing permissions:

- `personal_concepts`: legacy Editor exception only.
- `personal_collections`: legacy Editor exception only.
- `personal_cards`: standalone Cards or the legacy Editor exception. Migration 135 still denies all new Admin personal Cards.

The existing SECURITY DEFINER `create_personal_concept_overlay` additionally denies Admin/Learner creation, including privileged calls carrying those identities. Its original validation, ownership, Library, definition-owner, search-path and execution grants remain intact.

`save_personal_concept_with_overlay` continues updating an existing owned Concept and its placement. It cannot create a new Concept. SELECT, UPDATE, DELETE, membership operations, personal Topic creation, account-deletion functions and trusted database maintenance/recovery are unchanged. In particular, this INSERT-only retirement does not reclassify existing records or add new UPDATE restrictions.

The migration contains no data updates/deletes, new tables, cascades or Storage policy changes. Apply only after a separate authorized release, then run `verify_137_retire_legacy_personal_creation.sql`. This checkpoint does not authorize applying either file to Production. Do not remove existing records or automatically reverse the schema to recover an application release.

## Reproducible local verification

The dependency versions are the unchanged application versions. Node's test-only resolver handles existing extensionless TypeScript imports without modifying application source:

```
node --import ./tests/fixtures/legacy-retirement-resolution.mjs --test \
  tests/legacy-personal-retirement.test.mjs \
  tests/admin-personal-card-creation.test.mjs \
  tests/creator-studio-personal-content.test.mjs \
  tests/study-creator-context.test.mjs \
  tests/study-creator-socrates-browser.test.mjs \
  tests/study-creator-overlay-authoring.test.mjs \
  tests/personal-decks.test.mjs \
  tests/creator-learner-questions.test.mjs \
  tests/standalone-custom-cards.test.mjs \
  tests/learner-card-movement-search.test.mjs \
  tests/personal-card-media-workspace.test.mjs \
  tests/personal-card-media-preservation.test.mjs \
  tests/personal-card-media-routes.test.mjs \
  tests/personal-card-media-ui.test.mjs \
  tests/account-deletion.test.mjs \
  tests/account-deletion-retention.test.mjs \
  tests/account-deletion-postgres-ledger.test.mjs
```

`tests/legacy-personal-retirement-db.py` creates a new synthetic database clone in the existing network-isolated local recovery container. It refuses hosted infrastructure, non-synthetic accounts and existing target databases. Supply a fresh `legacy_personal137_run_<suffix>` name. It preserves the template database and reuses the existing image and account-deletion contracts without changing their assertions. Every behavioral mutation rolls back; trusted historical setup stays in the disposable clone for recovery testing.

The migration rehearsal compares every existing public/auth/Storage row, all other public functions/grants and all pre-existing policies. It also compares Study/Cram candidate identities/content/order, learning evidence, Topic selections and saved Personal Deck preferences. Tests include active Admin/Learner denial, unchanged Editor exceptions, inactive and anonymous denial, cross-owner/Library denial, historical editing, standalone creation, privileged writer restrictions, official authoring and account deletion.

`tests/legacy-personal-retirement-recovery.mjs <synthetic-db> <absolute-evidence-directory>` encrypts and authenticates a synthetic database plus image-byte archive, rejects tampering, restores to a separate database, compares all table fingerprints, restores the image bytes and checks private delivery authorization and the installed migration contract. Storage uses a local byte adapter with real database metadata; this is not a hosted Storage HTTP or Production backup rehearsal. Account-deletion recovery tests separately preserve the independent-ledger fail-closed and reconciliation contract.

## Verification evidence and limits

Evidence is preserved outside the repository at:
`/Users/itxiermeziani/.codex/local-evidence/legacy-personal-content-retirement-20261020/`.

- 153 focused application/handler/preservation tests pass.
- 47 migration and retirement authorization/preservation checks pass.
- 31 existing private-image database checks pass.
- 102 existing account-deletion checks pass.
- Synthetic encrypted restore: 121 table fingerprints and one private Storage image match.
- TypeScript, relevant application ESLint and standard optimized Next.js build pass.
- Historical `unified-creator-foundation.test.mjs`: 10 pass, 1 pre-existing failure on both baseline and candidate. Its old assertion expects every Editor official capability to be enabled, although official Topic management is already Admin-only. That unrelated assertion is preserved, not skipped or weakened. The task-specific tests verify that the current Editor permissions are unchanged.

UI checks execute actual components/handlers with disposable in-memory adapters; they are not live Production browser proof. Database checks use real isolated PostgreSQL authorization. No real account, educational content, learner preference or history was changed. Colima stayed at its existing 4 GiB configuration; no runtime restart was performed.
