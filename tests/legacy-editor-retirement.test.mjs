import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
import { resolveCreatorCommandRoute } from '../lib/creator-command-contracts.ts';
import * as routeAccess from '../lib/creator-route-access.ts';
import * as dataAccess from '../lib/creator-data-access.ts';
import { projectEditorRetirement } from './fixtures/editor-retirement.mjs';
import { projectLegacyRetirement } from './fixtures/legacy-personal-retirement.mjs';
import { editor, nodes, text, expandChrome } from './fixtures/creator-question-workflow.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const caps = role => deriveCreatorCapabilities({ role, userId: owner,
  library: { activeLibraryId: 'library', canAccessActiveLibrary: true, canManageActiveLibrary: true } });
function load(path, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, process: { env: {} }, require(name) {
    assert.ok(name in modules, `Unexpected import ${name}`); return modules[name];
  } });
  return exports;
}

function actor({ role = 'admin', active = true, signedIn = true, header = false, error = null } = {}) {
  const calls = [];
  const identity = { userId: owner, role, email: 'synthetic@example.invalid', displayName: 'Synthetic' };
  const db = {
    async rpc(name) { calls.push(name); assert.equal(name, 'account_is_active'); return { data: active, error }; },
    auth: { async getUser() { calls.push('getUser'); return { data: { user: signedIn ? { id: owner } : null }, error: null }; } },
    from(table) {
      assert.equal(table, 'user_roles');
      const q = { select() { return q; }, eq(key, value) { assert.equal(key, 'user_id'); assert.equal(value, owner); return q; },
        async maybeSingle() { return { data: { role }, error: null }; } }; return q;
    },
  };
  const mod = load('lib/server-creator-route-access.ts', {
    'server-only': {}, react: { cache: f => f },
    'next/navigation': { redirect(to) { throw Error(`redirect:${to}`); } },
    '@/lib/creator-route-access': routeAccess,
    '@/lib/creator-data-access': dataAccess,
    '@/lib/server-auth-context': { getVerifiedRequestAuthContext: async () => header && signedIn ? identity : null },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => db },
  });
  return { ...mod, calls };
}

for (const header of [false, true]) {
  test(`active Administrator is required even with verified request headers=${header}`, async () => {
    const admin = actor({ header });
    assert.equal((await admin.requireStaffCreatorRoute()).role, 'admin');
    assert.deepEqual(admin.calls, header ? ['account_is_active'] : ['getUser', 'account_is_active']);
    for (const role of ['editor', 'learner']) {
      const denied = actor({ role, header });
      const current = await denied.getServerCreatorRouteActor();
      assert.equal(current.role, role, 'Do not convert existing identities');
      assert.equal(denied.canActorAccessSharedCreator(current), true, 'Historical owner interface remains reachable');
      await assert.rejects(denied.requireStaffCreatorRoute(), /redirect:\/$/);
    }
    const inactive = actor({ header, active: false });
    assert.equal(await inactive.getServerCreatorRouteActor(), null);
    await assert.rejects(inactive.requireStaffCreatorRoute(), /redirect:\/login/);
  });
}

test('signed-out, stale role and failed activity checks never become authoring access', async () => {
  const signedOut = actor({ signedIn: false, active: false, error: { code: '42501' } });
  assert.equal(await signedOut.getServerCreatorRouteActor(), null);
  assert.deepEqual(signedOut.calls, ['getUser'], 'Anonymous sessions never call the authenticated-only activity RPC');
  for (const role of [null, '', 'Administrator', 'unknown']) {
    const current = actor({ role });
    const identity = await current.getServerCreatorRouteActor();
    assert.equal(identity.role, null);
    assert.equal(current.canActorAccessSharedCreator(identity), false);
    await assert.rejects(current.requireStaffCreatorRoute(), /redirect:\/$/);
  }
  await assert.rejects(actor({ error: { code: 'XX000', message: 'private database error' } }).getServerCreatorRouteActor(),
    error => error instanceof dataAccess.CreatorDataAccessError && !error.message.includes('private database error'));
});

test('Library resolution never converts missing or unknown roles into Learner access', async () => {
  for (const role of [null, '', 'Administrator', 'unknown']) {
    const db = { auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
      from(table) { const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; },
        then(resolve) { return Promise.resolve({ data: table === 'user_roles' ? { role } : [], error: null }).then(resolve); } }; return q; } };
    const mod = load('lib/library-context.ts', {
      'next/headers': { cookies: async () => ({ get: () => undefined }) },
      '@/lib/supabase-server': { createSupabaseServerClient: async () => db },
      '@/lib/server-auth-context': { getVerifiedRequestAuthContext: async () => null },
      '@/lib/home-bootstrap': { getSoleAccessibleLibrary() { throw Error('Unknown role must fail before selecting a Library'); } },
      '@/lib/creator-data-access': dataAccess,
    });
    const context = await mod.resolveActiveLibraryContext({ failOnQueryError: true });
    assert.equal(context.role, 'anonymous'); assert.equal(context.library, null);
    assert.equal(context.user, null); assert.equal(context.isUnauthorized, true);
    assert.equal(context.canSwitch, false); assert.equal(context.hasMembership, false);
  }
});

test('server capabilities retain Library and owner boundaries; only active Admin has official authority', async () => {
  for (const role of ['admin', 'editor', 'learner']) {
    const mod = load('lib/server-creator-capabilities.ts', {
      'server-only': {}, '@/lib/creator-capabilities': { deriveCreatorCapabilities },
      '@/lib/server-creator-route-access': { getServerCreatorRouteActor: async () => ({ userId: owner, role }) },
      '@/lib/library-context': { resolveActiveLibraryContext() { throw Error('Must reuse supplied trusted context'); } },
    });
    const context = { user: { id: owner }, role, library: { id: 'library' }, isUnauthorized: false };
    const result = await mod.getServerCreatorCapabilityManifest({ activeLibraryContext: context });
    assert.equal(result.subject.role, role);
    assert.equal(result.official.saveConcept, role === 'admin');
    const denied = await mod.getServerCreatorCapabilityManifest({ activeLibraryContext: { ...context, isUnauthorized: true } });
    assert.equal(denied.official.saveConcept, false);
    assert.equal(denied.official.readUnpublished, false);
    await assert.rejects(mod.getServerCreatorCapabilityManifest({ activeLibraryContext: { ...context, user: { id: 'foreign' } } }), /different user/);
  }
});

test('Editor creation commands deny all new content while owner updates retain their identities', () => {
  const editorCaps = caps('editor');
  for (const command of [
    { type: 'create-topic', target: 'personal', ownerId: owner, parentKey: null },
    { type: 'create-concept', target: 'personal', ownerId: owner, topicKey: 'personal:topic:topic' },
    { type: 'create-card', target: 'personal', ownerId: owner, conceptKey: 'personal:concept:concept' },
    { type: 'create-concept', target: 'official', libraryId: 'library', topicKeys: ['official:topic:topic'] },
    { type: 'create-question', target: 'official', libraryId: 'library', conceptKey: 'official:concept:concept' },
  ]) assert.throws(() => resolveCreatorCommandRoute(command, editorCaps), /not permitted|retired/);
  for (const [kind, route] of [['concept', 'personal-concept-owner-write'], ['card', 'personal-card-owner-write']]) {
    const command = { type: `update-${kind}`, target: 'personal', ownerId: owner, [`${kind}Key`]: `personal:${kind}:historical` };
    assert.equal(resolveCreatorCommandRoute(command, editorCaps), route);
    assert.throws(() => resolveCreatorCommandRoute({ ...command, ownerId: 'another-owner' }, editorCaps), /signed-in owner/);
  }
  assert.equal(editorCaps.personal.createCard, false);
  assert.equal(editorCaps.personal.createTopic, false);
  assert.equal(caps('learner').personal.createCard, true);
  assert.equal(caps('learner').personal.createTopic, true);
  assert.equal(caps('admin').official.saveConcept, true);
  assert.equal(caps('admin').official.saveQuestion, true);
  assert.equal(caps('admin').official.manageTopicTree, true);
});

test('actual Editor component has no creation tools and keeps historical owner Card editing', () => {
  const h = editor({ role: 'editor', placed: true });
  let e = h.render();
  assert.equal(e.creatorAuthority.role, 'editor');
  assert.equal(e.creatorAuthority.canReadUnpublished, false);
  assert.equal(e.creatorAuthority.canSaveConcept, false);
  assert.equal(e.creatorAuthority.canSaveQuestion, false);
  const workspace = nodes(e.tree).find(n => n.type?.name === 'CreatorLearnerQuestionsWorkspace');
  assert.equal(workspace.props.canCreate, false);
  workspace.props.onNew();
  e = h.render(); assert.equal(e.standaloneRequest, null);
  e.openAddDialog(); e.openPersonalTopicDialog();
  assert.equal(h.render().dialogMode, null);
  const buttons = nodes(expandChrome(h.render().tree)).filter(n => n.type === 'button');
  assert.ok(!buttons.some(n => ['New Concept', 'New Question', 'Add Custom Card'].includes(text(n))));
  assert.ok(buttons.some(n => text(n) === 'Historical personal content'));
  e.setStandaloneCards([{ id: 'historical', owner_id: 'owner', concept_id: null,
    question: 'Preserved Front', answer: 'Preserved Back', library_node_id: 'topic', library_id: 'library', personal_topic_id: null }]);
  h.render().selectExistingQuestion({ source: 'personal', id: 'historical', conceptId: null });
  e = h.render(); assert.equal(e.standaloneRequest.card.id, 'historical');
  assert.equal(e.standaloneRequest.card.question, 'Preserved Front');
  const cardEditor = nodes(e.tree).find(n => n.type?.name === 'StandaloneCustomCardWorkspace');
  assert.equal(cardEditor.props.canCreate, false);
  assert.equal(cardEditor.props.ownerId, 'owner');
  assert.equal(h.calls.length, 0); assert.equal(h.routes.length, 0);
});

test('historical integrity projector permits only the exact authorization changes', () => {
  const path = 'components/CreatorStudioV2Client.tsx', source = read(path);
  const baseline = projectEditorRetirement(path, source);
  const proof = JSON.parse(read('tests/fixtures/editor-retirement-source-proof.json'));
  assert.notEqual(source, baseline);
  assert.equal(projectEditorRetirement(path, baseline), baseline);
  assert.doesNotThrow(() => projectLegacyRetirement(path, source));
  for (const altered of [source + '\n// unrelated edit\n', source.replace('setDraftQuestionPrimaryId(null);', "setDraftQuestionPrimaryId('changed');"),
    source.replace(proof.hunks[0][0], proof.hunks[0][1])]) {
    assert.notEqual(altered, source);
    assert.throws(() => projectEditorRetirement(path, altered), /Editor retirement/);
    assert.throws(() => projectLegacyRetirement(path, altered), /Editor retirement/);
  }
});

test('protected application, learning, media and recovery files remain byte-identical to Production', () => {
  const base = '38cf5bd64b89d412a959d14abc97486d13ea8bd5';
  const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', base], { encoding: 'utf8' }).trim().split('\n');
  const protectedPaths = paths.filter(path => /^(?:app\/(?:home\.css|page\.tsx|study-creator\/|study\/|cram\/|stats\/|website\/|admin\/|api\/)|components\/(?:StudyPlanner|study-planner\/|StudyCreator|PersonalDeck|PersonalCard|AdminInbox)|lib\/(?:account-deletion|study-|home-|personal-card|standalone-custom-cards|learner-card|topic-placement-graph)|scripts\/reconcile-account-deletions|supabase\/\d{3}_)/.test(path));
  for (const required of ['app/home.css', 'components/StudyPlanner.tsx', 'components/study-planner/StudyGoals.tsx',
    'lib/standalone-custom-cards.ts', 'lib/account-deletion.ts', 'supabase/138_role_management_safeguards.sql',
    'supabase/139_final_admin_account_deletion.sql']) assert.ok(protectedPaths.includes(required), required);
  for (const path of [...protectedPaths, 'proxy.ts', 'lib/content-media/service.ts', 'lib/content-media/image.ts']) {
    assert.equal(read(path), execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }), path);
  }
});
