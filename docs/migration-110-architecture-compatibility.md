# Migration 110 architecture compatibility and release invariant

Decision: **MIGRATION 110 ARCHITECTURE COMPATIBLE — READY FOR RELEASE REVIEW**.
This is architectural compatibility approval only, not permission to stage,
commit, push, deploy, or install. No migration, application, or test implementation
was changed during this review. No database was accessed or mutated.

## Exact review scope

Reviewed the working candidate, its eight application files, six modified test
files, and five new validation files listed in the fingerprint appendix. Compared
tracked application/test deltas against HEAD `292a5add3a1225db9f6e180fe9a7d134b4bf3eda`.
Migration 110 SHA-256: `667db1c0f5e9899bde0f4a4c0ff951be14d36bd12558b85f371f797e3944a5b8`.
Migration 109 was also inspected and has no working-tree diff.

## Explicit release invariant

Migration 110 is a Topic-placement structural migration. Its acceptance criteria
must remain independent of whether custom educational content is Concept-backed
or a standalone owner-qualified Front/Back Card.

It must not require a Concept, a hidden Concept wrapper, a synthetic custom Topic,
or an official Concept association solely to make a future standalone Card fit
the Topic tree. It must remain compatible with both future product workflows:

- Canonical Topic → Add Custom → Front/Back Card.
- Canonical Topic → custom Subtopic → Front/Back Card.

Official material may retain Topic → Concept → multiple Questions.
A shared Topic association must not automatically turn standalone Card responses
into evidence of mastery of an official Concept. That rule is a future learning-
evidence boundary; no new evidence attribution is implemented in Migration 110.

Compatibility means that 110 imposes no conflicting requirement. It does not
mean standalone Card storage, authoring, delivery, or learning evidence already
exists in the current application.

## Answers to the six review questions

1. **Does 110 require every future custom Card to belong to a personal Concept?**
   No. The migration does not reference `personal_cards`, `personal_concepts`,
   `concept_id`, or educational evidence tables. The current Card schema still
   requires a Concept because of Migration 068; 110 does not create or extend
   that dependency.
2. **Is the one-tree invariant only at Topic/placement level?** Yes. The two new
   deferred constraint triggers attach to `personal_topics` and
   `personal_topic_official_placements`. The function reads same-owner Topic
   ancestry, placements, `library_nodes`, and active `libraries`.
3. **Is a standalone Card directly associated with a canonical Topic compatible?**
   Yes. An owner-qualified Card-to-canonical-Topic association would not require
   a personal Topic root or invoke a new 110 Card constraint. The future Card
   relation/API must independently validate ownership, target authorization,
   canonical association, and deletion behavior. 110 does not enforce that
   not-yet-created Card edge, and its Topic placement table must not be repurposed
   as a Card placement table.
4. **Is a standalone Card beneath a placed custom subtopic compatible?** Yes.
   The subtopic already resolves through same-owner parents to a placed root.
   Its validity does not depend on any Concept or Card existing beneath it.
   The future Card-to-subtopic relationship needs its own ownership/FK and
   lifecycle rules, without changing the 110 ancestry invariant.
5. **Did an application change introduce a universal Concept requirement?** No.
   The reviewed deltas concern Topic creation, Topic moves, source-qualified
   tree visibility, the staff legacy-route redirect, and Home root rejection.
   Existing Concept-based Card editors and bootstrap contracts remain existing
   implementation limitations for the future standalone-Card feature.
6. **Did a new constraint, trigger, RPC, tree/Home rule, or test encode that
   universal requirement?** No. 110 adds no RPC and no Card/Concept constraint.
   Creator/Home composition consumes Topic structure, not a required Concept
   list. New structural fixtures create and validate Topics without creating
   Concepts or Cards. Existing ownership/editor tests still use existing
   Concept-backed Card fixtures; they are regression coverage for that path,
   not a prohibition on a future separate Card path.

## Existing Concept dependencies, outside the 110 delta

- `supabase/068_study_creator_personal_content_foundation.sql:95` creates
  `personal_cards`; `concept_id` is NOT NULL at line 99, with the composite
  Concept/owner FK at lines 109–112.
- `lib/creator-personal-content.ts:24` defines `CreatorPersonalCard` with a
  required `concept_id`. This file has no candidate diff.
- `components/StudyCreatorClient.tsx:717` retains the existing Card save handler
  that requires `cardConceptId` and writes `concept_id`. No 110 hunk changes it.
- `components/CreatorStudioV2Client.tsx:4972` retains the existing personal Card
  save handler and Concept lookup. No 110 hunk changes that association.
- `supabase/071_personal_study_attempts.sql:22` makes personal attempts
  Concept-qualified, with composite Card/Concept/owner references; personal
  learning state is also Concept-based.
- `supabase/109_unified_deck_settings_backend.sql:294` includes existing
  Concept-based Card balance resolution; the existing candidate-resolution
  and personal study paths also join Cards through personal Concepts.

Consequently, simply omitting `concept_id` from an insert into today's
`personal_cards` table is not supported. A future migration and application
feature must address the old schema, types, authoring, discovery, study delivery,
and evidence contracts. This work was already necessary before 110. The review
chooses neither a new Card table nor a nullable-Concept design, nor hidden wrappers.

## Topic-placement and selection boundaries

The 110 function and triggers are at migration lines 43–86. Deferred validation
allows atomic Topic-plus-placement creation and rejects completed structural
writes that leave a surviving affected branch without an active canonical
association. It neither inspects nor creates educational objects.

`composeUnifiedCreatorTopicTree` receives official Topics, personal Topics,
owner identity, and placements. `composeHomeGroups` receives canonical nodes,
personal Topics, placements, and collections. The new Home rule rejects an
unplaced personal Topic; it makes no assertion that Cards must have Concepts.
Those helpers do not yet render standalone Cards, which remains future UI work.

Migration 110's preflight pins the required post-109 installation baseline.
Its postflight snapshots preserve all existing functions/security contracts
through **this installation transaction**. These checks are not persistent
restrictions on a later, separately reviewed migration changing Card APIs or
study contracts.

Migration 109 selection/inheritance remains unchanged. No decision is made about
canonical-parent selection governing custom descendants, Card selection,
New ↔ Mastery, scheduling, or learning evidence. No official mastery attribution
is introduced by shared Topic placement.

## Historical-content and release boundaries

The user-identified six historical Topics, five Concepts, twelve Cards, and
dependent state remain outside 110 and outside this review. They were not
inspected, placed, migrated, modified, deleted, or granted an exact-ID preservation
exception. The migration performs no historical-content DML. Its generic
rename/normalization handling is not a cleanup or preservation mandate for those
records. Separate exact-ID Production cleanup remains separate work.

Legitimate canonical Socrates/Adam content remains untouched. No Home or Creator
styling/redesign work, database access, SQL verifier execution, installation,
staging, commit, push, or deployment occurred in this review.

## Review validation

Read the exact migration, all candidate application/test changes, new validation
scripts, and the pre-existing Card/attempt schema and type/authoring boundaries.
Re-ran seven local application test files: **137 passed, 0 failed, 0 skipped**.
These tests use local fixtures/mocked handlers and do not install migrations.
No future standalone-Card schema or end-to-end workflow was implemented or
claimed tested. SQL tests and the prior full build were not rerun for this
source/documentation-only review.

## Reviewed-file SHA-256 fingerprints

These fingerprints identify the exact reviewed implementation. Documentation
is the only new deliverable from this review; candidate files remain unchanged.

- `supabase/110_canonical_personal_topic_placement.sql`: `667db1c0f5e9899bde0f4a4c0ff951be14d36bd12558b85f371f797e3944a5b8`
- `supabase/109_unified_deck_settings_backend.sql`: `16ca9e64e6b64cc6f436d326b687cfc833890f2c666de3f31d763300f9b63b3b`
- `app/study-creator/page.tsx`: `5e070bf756028731d35f977c410635108a3526d93577ccbd7c0fa0dcdc64c0b3`
- `components/CreatorStudioV2Client.tsx`: `dfb69afaf1c79dd7c13e9f5a59512238a86bd4e8fa1eda8a1da6698159d830df`
- `components/CreatorTopicTreeInteraction.tsx`: `27197024143cb7c94edc3857be7ea304c5dde0330ed8b090d5974121dd693c45`
- `components/StudyCreatorClient.tsx`: `61059beff8edc76c04d98816fec03708d759bcd9b4ce30bebaa13cb2095bdb3b`
- `lib/creator-personal-structure.ts`: `8dbbf5c7a7b300851f9fc177ba778eabb1ca459d39c9c50d5058bd943ce38b75`
- `lib/creator-topic-positioning.ts`: `eb02d0a0eec9cc998e162d9ce2aaf7c6ab54178afe68320452ab011bde78be90`
- `lib/creator-unified-topic-tree.ts`: `5ca6babaef355cbfb307e0ee016aac07b9cb5be3410f1dde0b4b6b564d4945e3`
- `lib/home-deck-settings.ts`: `71ea143b0fb55bf878d0bd510712e610f684957434e7e2915b2034bbc874cba1`
- `supabase/verify_110_canonical_personal_topic_placement.sql`: `4ce136e78f99af6945908cc4e79112337df778cc7663a17b8d352b34afefc2f2`
- `tests/canonical-one-tree-write-paths.test.mjs`: `e46e3b580675f538c40c69484c9ba5842f21907762324199fb592666f935a6e2`
- `tests/canonical-one-tree-concurrency.py`: `50e023b8aef33f0b22670e1a06d30e14dd59b889fb04b9b046546caacdd3a8c1`
- `tests/canonical-one-tree-preflight.py`: `6b172d6c9f6f0f2a1c00ceb3e5c90b277a9733c659ec64bf35d85788fdad458d`
- `tests/canonical-one-tree-regression.py`: `382ee0fd07f146e25c910bce545805dafcefb28bb6c55f91b5017ab9cd9da8a3`
- `tests/creator-personal-structure.test.mjs`: `3c2aaaf457340f020723629e14b730aa0df9816f6c78ada193107ebb01af7adb`
- `tests/creator-role-derived-ownership.test.mjs`: `43ffd67175cf70faa9171feeb9a125a0d0774b78f2dea2ae136a6e5dfb5f8f1f`
- `tests/creator-structural-integration.test.mjs`: `a8a43a35f1c7ed28829f5d899a0992f74c128bb69931ac340884053c20a63074`
- `tests/creator-topic-positioning.test.mjs`: `3d4ee36a0c31a3e4a9390de1796362cad0a3c9ec6d4872959d1d40e32204f206`
- `tests/creator-unified-topic-tree.test.mjs`: `0bfc80581e9186525843c7442f6068af036f1e466bfb27dc9243bd50d3040d14`
- `tests/home-unified-deck-settings.test.mjs`: `82937a62651c98b961223fc02841b7d3467ce3d9f4c6828bd3941c36f8f91d0b`
