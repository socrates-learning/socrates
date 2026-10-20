import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConceptModule } from './fixtures/concept-media-authoring.mjs';

const ids = { conceptId: '00000000-0000-4000-8000-000000000001', questionId: '00000000-0000-4000-8000-000000000002',
  libraryId: '00000000-0000-4000-8000-000000000003' };
function setup(overrides = {}) {
  const reads = [];
  const options = { role: 'admin', active: true, user: { id: 'synthetic-admin' }, ...overrides };
  const db = {
    auth: { getUser: async () => ({ data: { user: options.user }, error: options.authError || null }) },
    rpc: async name => { assert.equal(name, 'account_is_active'); return { data: options.active, error: options.error }; },
    from(table) {
      const filters = [];
      reads.push({ table, filters });
      const q = { select: () => q, eq: (k, v) => { filters.push([k, v]); return q; }, limit: () => q,
        maybeSingle: async () => ({ data: table === 'user_roles' ? { role: options.role }
          : table === 'concept_placements' ? options.missingPlacement || (options.missingPrimary && filters[0][1] === 'another-primary') ? null : { concept_id: filters[0][1] }
            : table === 'questions' ? options.missingQuestion ? null : { id: ids.questionId, concept_id: options.related ? 'another-primary' : ids.conceptId }
              : table === 'question_related_concepts' ? options.unrelated ? null : { concept_id: ids.conceptId } : null,
        error: options.error || null }) };
      return q;
    },
  };
  const action = loadConceptModule('lib/creator-concept-navigation.ts', {
    '@/lib/supabase-server': { createSupabaseServerClient: async () => db },
    '@/lib/library-context': { resolveActiveLibraryContext: async () => ({
      user: options.contextUser || options.user, role: options.role, isUnauthorized: Boolean(options.unauthorized),
      library: { id: options.libraryId || ids.libraryId, status: options.libraryStatus || 'active' },
    }) },
  }).authorizeConceptNavigation;
  return { action, reads };
}
test('active Admin can navigate to the exact primary or related Concept within the active Library', async () => {
  for (const related of [false, true]) {
    const h = setup({ related });
    assert.equal(await h.action(ids), true);
    assert.ok(h.reads.some(r => r.table === 'concept_placements' && r.filters.some(([k, v]) => k === 'library_nodes.library_id' && v === ids.libraryId)));
    if (related) assert.ok(h.reads.some(r => r.table === 'question_related_concepts' && r.filters.some(([k, v]) => k === 'question_id' && v === ids.questionId)));
  }
});
for (const [label, changes] of [
  ['Editor', { role: 'editor' }], ['Learner', { role: 'learner' }], ['anonymous', { user: null }],
  ['revoked session', { authError: { message: 'revoked' } }], ['inactive', { active: false }],
  ['unknown activity', { active: null }], ['cross-Library', { libraryId: 'another-library' }],
  ['inactive Library', { libraryStatus: 'archived' }], ['unauthorized Library', { unauthorized: true }],
  ['unavailable Concept', { missingPlacement: true }], ['unavailable Question', { missingQuestion: true }],
  ['forged association', { related: true, unrelated: true }], ['database error', { error: { message: 'private error' } }],
  ['related Concept of a Question outside this Library', { related: true, missingPrimary: true }],
  ['changed authenticated actor', { contextUser: { id: 'another-user' } }],
]) test(`${label} is denied without any write capability`, async () => {
  const h = setup(changes);
  assert.equal(await h.action(ids), false);
});
test('invalid input fails closed; unsaved Questions may only open an existing authorized Concept', async () => {
  const h = setup();
  for (const input of [null, {}, { ...ids, conceptId: 'invalid' }, { ...ids, questionId: 'forged' }]) {
    assert.equal(await h.action(input), false);
  }
  assert.equal(h.reads.length, 0);
  assert.equal(await h.action({ ...ids, questionId: null }), true);
});
