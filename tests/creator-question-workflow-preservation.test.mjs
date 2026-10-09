import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { editor, nodes, text, expandChrome, source, question, row, emptyFilters, settle } from './fixtures/creator-question-workflow.mjs';
import { canPosition } from '../lib/creator-topic-positioning.ts';
import { deriveCreatorCapabilities } from '../lib/creator-capabilities.ts';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function questions(options) { const h = editor(options); h.render().setActiveCreatorTab('questions'); return h; }
function draft(h) { let e = h.render(); e.selectQuestionConcept('primary', 'topic'); e = h.render(); e.setQuestionPrompt('Question?'); e.setQuestionAnswer('Answer'); return h.render(); }
for (const role of ['admin', 'editor']) {
    test(`${role}: no, single and multiple Concept contexts use the released selection effect`, () => {
        const h = questions({ role });
        let e = h.render();
        assert.equal(e.questionConceptId, null);
        for (const [options, expected] of [[[], null], [[{ id: 'primary', name: 'Primary' }], 'primary'], [[{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], null]]) {
            e.setQuestionConceptId(null);
            e.setQuestionTopicId('topic');
            e.setQuestionConceptsByTopicId({ topic: options });
            h.render();
            h.runEffect('setQuestionConceptOptions(options)');
            e = h.render();
            assert.equal(e.questionConceptId, expected);
            assert.equal(e.questionConceptOptions.length, options.length);
        }
        e.setQuestionConceptId('b');
        h.render();
        h.runEffect('setQuestionConceptOptions(options)');
        assert.equal(h.render().questionConceptId, 'b');
    });
    test(`${role}: related result edits true Primary, new retains browse Concept`, () => {
        const h = questions({ role });
        h.render().selectQuestionConcept('related', 'topic');
        h.render().selectExistingQuestion(question());
        let e = h.render();
        assert.equal(e.questionConceptId, 'related');
        assert.equal(e.primaryQuestionConceptId, 'primary');
        assert.equal(e.questionId, 'q1');
        assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
        assert.equal(e.isQuestionDirty, false);
        e.startNewQuestion();
        e = h.render();
        assert.equal(e.questionId, null);
        assert.equal(e.questionConceptId, 'related');
        assert.equal(e.primaryQuestionConceptId, 'related');
        assert.deepEqual(plain(e.questionRelatedConceptIds), []);
    });
    test(`${role}: successful new save carries visible metadata and resets hidden defaults`, async () => {
        const h = questions({ role });
        let e = draft(h);
        e.setQuestionDifficulty('hard');
        e.setQuestionTestingAngle('Priority');
        e.setQuestionRecordStatus('draft');
        e.setQuestionTags([{ id: 'tag', name: 'Tag', slug: 'tag', status: 'active' }]);
        e.setQuestionRelatedConceptIds(['related']);
        e.setQuestionAdditionalTestingAngles(['Safety']);
        e = h.render();
        await e.saveCurrentQuestion();
        e = h.render();
        const command = h.calls.find(c => c.name === 'save_question_with_format');
        assert.ok(command);
        assert.equal(command.payload.p_payload.p_question_id, null);
        assert.equal(command.payload.p_payload.p_concept_id, 'primary');
        assert.equal(command.payload.p_payload.p_prompt, 'Question?');
        assert.deepEqual(plain(command.payload.p_payload.p_accepted_answers), [{ id: null, answer_text: 'Answer', answer_format: 'visual_markdown_v1', sort_order: 0 }]);
        assert.equal(e.questionPrompt, '');
        assert.equal(e.questionAnswer, '');
        assert.equal(e.questionId, null);
        assert.equal(e.questionConceptId, 'primary');
        assert.equal(command.payload.p_payload.p_difficulty, 'medium');
        assert.equal(command.payload.p_payload.p_status, 'published');
        assert.equal(e.questionDifficulty, 'medium');
        assert.equal(e.questionRecordStatus, 'published');
        assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
        assert.deepEqual(plain(e.questionAdditionalTestingAngles), ['Safety']);
        assert.equal(e.questionTags[0].id, 'tag');
        e.startNewQuestion();
        e = h.render();
        assert.equal(e.questionDifficulty, 'medium');
        assert.equal(e.questionRecordStatus, 'published');
        assert.equal(e.questionTestingAngle, 'General Understanding');
        assert.equal(e.questionTags.length, 0);
        assert.equal(e.questionRelatedConceptIds.length, 0);
    });
}
for (const [setter, value] of [['setQuestionPrompt', 'Changed question'], ['setQuestionAnswer', 'Changed answer'], ['setQuestionDifficulty', 'hard'], ['setQuestionRelatedConceptIds', ['other']], ['setQuestionAdditionalTestingAngles', ['Safety']], ['setQuestionTags', [{ id: 'tag', name: 'Tag' }]]]) {
    test(`dirty tracking includes ${setter}`, () => { const h = questions(); h.render().selectExistingQuestion(question()); let e = h.render(); assert.equal(e.isQuestionDirty, false); e[setter](value); e = h.render(); assert.equal(e.isQuestionDirty, true); assert.equal(e.isDirty, true); });
}
test('edit save preserves identity and Primary while updating its source', async () => {
    const h = questions();
    h.render().selectQuestionConcept('related', 'topic');
    h.render().selectExistingQuestion(question());
    h.render().setQuestionAnswer('Updated');
    await h.render().saveCurrentQuestion();
    const e = h.render();
    assert.equal(e.questionId, 'q1');
    assert.equal(e.questionAnswer, 'Updated');
    assert.equal(e.primaryQuestionConceptId, 'primary');
    assert.equal(e.isQuestionDirty, false);
    const p = h.calls.find(c => c.name === 'save_question_with_format').payload.p_payload;
    assert.equal(p.p_question_id, 'q1');
    assert.equal(p.p_concept_id, 'primary');
});
test('failure retains draft and releases busy state; concurrent save dispatches once', async () => {
    let release;
    const h = questions({ response: name => name === 'save_question_with_format' ? new Promise(resolve => { release = resolve; }) : undefined });
    const e = draft(h);
    const a = e.saveCurrentQuestion();
    const b = e.saveCurrentQuestion();
    assert.equal(h.calls.filter(c => c.name === 'save_question_with_format').length, 1);
    assert.equal(h.render().isSavingQuestion, true);
    h.render().startNewQuestion();
    assert.equal(h.render().questionPrompt, 'Question?');
    release({ data: null, error: { message: 'Synthetic save failure' } });
    await Promise.all([a, b]);
    const after = h.render();
    assert.equal(after.isSavingQuestion, false);
    assert.equal(after.questionPrompt, 'Question?');
    assert.equal(after.questionAnswer, 'Answer');
    assert.equal(after.isQuestionDirty, true);
    assert.match(after.questionStatus.message, /Synthetic save failure/);
});
test('discard refusal protects Concept/result/New navigation; same result never prompts or reloads', () => {
    const h = questions({ confirm: () => false });
    h.render().selectExistingQuestion(question());
    h.render().setQuestionAnswer('Unsaved');
    let e = h.render();
    e.selectExistingQuestion(question());
    e.selectQuestionSearchResult(question());
    assert.equal(h.confirmations.length, 0);
    assert.equal(h.render().questionAnswer, 'Unsaved');
    e.startNewQuestion();
    e.selectQuestionConcept('other', 'topic');
    e.selectExistingQuestion(question({ id: 'q2' }));
    assert.equal(h.confirmations.length, 3);
    assert.equal(h.render().questionId, 'q1');
    assert.equal(h.render().questionAnswer, 'Unsaved');
});
test('current official section-switch limitation: draft retained without prompt, active-tab guard only', () => {
    const h = questions({ confirm: () => false });
    draft(h);
    const tree = h.render().tree;
    const tabs = nodes(tree).find(n => n.type?.name === 'CreatorStudioTabs');
    assert.ok(tabs);
    tabs.props.onSelect('content');
    let e = h.render();
    assert.equal(e.activeCreatorTab, 'content');
    assert.equal(e.questionPrompt, 'Question?');
    assert.equal(e.isQuestionDirty, true);
    assert.equal(e.isDirty, false);
    assert.equal(h.confirmations.length, 0);
    assert.equal(h.runShellGuard(), true);
    tabs.props.onSelect('questions');
    e = h.render();
    assert.equal(e.isDirty, true);
    assert.equal(h.runShellGuard(), false);
});
test('Existing Questions maps Primary/Related and accepted-answer order without reordering server results', async () => {
    const rows = [row({ id: 'new', concept_id: 'primary', created_at: '2026-02-01', question_accepted_answers: [{ answer_text: 'Second', sort_order: 1 }, { answer_text: 'First', sort_order: 0 }] }), row({ id: 'old', concept_id: 'other', related_concepts: [{ id: 'primary', name: 'Primary' }], created_at: '2026-01-01' })];
    const h = questions({ response: name => name === 'get_creator_questions_with_media' ? { data: rows, error: null } : undefined });
    h.render().selectQuestionConcept('primary', 'topic');
    await settle();
    let e = h.render();
    assert.deepEqual(plain(e.existingQuestions.map(q => q.id)), ['new', 'old']);
    assert.equal(e.existingQuestions[0].answer, 'First');
    const tree = expandChrome(e.tree);
    assert.match(text(tree), /Primary Question/);
    assert.match(text(tree), /Related Question/);
    const list = nodes(tree).find(n => n.props?.['aria-label'] === 'Existing Questions, newest first');
    assert.equal(list.props.tabIndex, 0);
    nodes(list).find(n => n.type === 'button' && text(n).includes('Related Question')).props.onClick();
    assert.equal(h.render().primaryQuestionConceptId, 'other');
    const css = read('components/CreatorStudioV2Client.module.css');
    assert.match(css, /\.existingQuestionList\s*\{[^}]*max-height:[^}]*overflow:\s*auto/s);
});
test('Existing Questions empty/error readback does not invent results', async () => { const h = questions({ response: name => name === 'get_creator_questions_with_media' ? { data: null, error: { message: 'No access' } } : undefined }); assert.equal(await h.render().fetchExistingQuestions('primary', 'library'), null); h.render().setQuestionConceptId('primary'); assert.match(text(expandChrome(h.render().tree)), /No questions yet/); });
test('search forwards all filters and keyset bounds; deduplicates source-qualified identities', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => row({ id: i === 0 ? 'mine-card' : `q${i}`, created_at: `2026-02-${String(28 - Math.floor(i / 2)).padStart(2, '0')}` }));
    const h = questions({ response: name => name === 'search_creator_questions_with_media' ? { data: rows, error: null } : undefined });
    const filters = { ...emptyFilters, text: ' Question ', difficulty: 'hard', primaryTestingAngle: 'Priority', additionalTestingAngle: 'Safety', primaryConceptId: 'primary', relatedConceptId: 'related', status: 'published', tagId: 'tag' };
    await h.render().loadQuestionSearchPage(filters, null, false);
    const p = h.calls.find(c => c.name === 'search_creator_questions_with_media').payload;
    assert.deepEqual(plain(p), { p_active_library_id: 'library', p_search_text: 'Question', p_difficulty: 'hard', p_primary_testing_angle: 'Priority', p_additional_testing_angle: 'Safety', p_primary_concept_id: 'primary', p_related_concept_id: 'related', p_status: 'published', p_tag_id: 'tag', p_page_size: 50, p_before_created_at: null, p_before_id: null });
    let e = h.render();
    assert.equal(e.questionSearchResults.length, 50);
    assert.equal(e.questionSearchHasMore, true);
    assert.equal(e.questionSearchCursor.id, 'q49');
    await e.loadQuestionSearchPage(emptyFilters, e.questionSearchCursor, true);
    e = h.render();
    assert.equal(e.questionSearchResults.filter(q => q.id === 'mine-card' && q.source === 'official').length, 1);
    await e.loadQuestionSearchPage(emptyFilters, null, false);
    e = h.render();
    assert.equal(e.questionSearchResults.filter(q => q.id === 'mine-card').length, 2);
    assert.deepEqual(new Set(e.questionSearchResults.filter(q => q.id === 'mine-card').map(q => q.source)), new Set(['official', 'personal']));
});
test('search selection resolves actual Primary/topic; same-selected identity retains dirty edits', () => { const h = questions(); let e = h.render(); e.setQuestionConceptsByTopicId({ topic: [{ id: 'primary', name: 'Primary' }] }); e = h.render(); e.selectQuestionSearchResult(question()); e = h.render(); assert.equal(e.questionConceptId, 'primary'); assert.equal(e.questionTopicId, 'topic'); e.setQuestionPrompt('Unsaved'); h.render().selectQuestionSearchResult(question()); assert.equal(h.render().questionPrompt, 'Unsaved'); assert.equal(h.confirmations.length, 0); });
test('newer Library search request wins over stale completion', async () => {
    const pending = [];
    const h = questions({ response: name => name === 'search_creator_questions_with_media' ? new Promise(resolve => pending.push(resolve)) : undefined });
    const old = h.render().loadQuestionSearchPage(emptyFilters, null, false);
    h.props.activeLibraryId = 'next-library';
    h.props.creatorCapabilities = deriveCreatorCapabilities({ userId: 'owner', role: 'admin', library: { activeLibraryId: 'next-library', canAccessActiveLibrary: true, canManageActiveLibrary: true } });
    const current = h.render().loadQuestionSearchPage(emptyFilters, null, false);
    pending[1]({ data: [row({ id: 'new-library' })], error: null });
    await current;
    pending[0]({ data: [row({ id: 'stale-library' })], error: null });
    await old;
    assert.equal(h.render().questionSearchResults[0].id, 'new-library');
});
test('staff personal legacy search result uses owner-qualified Card identity; standalone opens Content', () => {
    const h = questions();
    h.render().selectQuestionSearchResult(question({ source: 'personal', kind: 'card', id: 'mine-card', conceptId: 'mine-concept' }));
    let e = h.render();
    assert.equal(e.questionSource, 'personal');
    assert.equal(e.questionPrompt, 'Personal Question');
    e.setStandaloneCards([{ id: 'standalone', owner_id: 'owner', concept_id: null, library_id: 'library', library_node_id: 'topic', personal_topic_id: null, question: 'Standalone', answer: 'Answer', created_at: '2026-01-01', updated_at: '2026-01-01' }]);
    h.render().selectQuestionSearchResult(question({ source: 'personal', kind: 'card', id: 'standalone', conceptId: null }));
    e = h.render();
    assert.equal(e.activeCreatorTab, 'content');
    assert.equal(e.standaloneRequest.card.id, 'standalone');
});
test('Questions tree shares Content structural controls and dedicated Topic drag handles', () => {
    const h = questions({ placed: true });
    let e = h.render();
    const tree = expandChrome(e.tree);
    assert.ok(nodes(tree).some(n => n.type?.name === 'TopicDragHandle'));
    assert.match(text(tree), /Add Subtopic/);
    assert.match(text(tree), /Rename/);
    assert.match(text(tree), /Move/);
    e.setActiveCreatorTab('content');
    e = h.render();
    assert.ok(nodes(e.tree).some(n => n.type?.name === 'TopicDragHandle'));
    assert.equal(typeof e.positionTopicFromTree, 'function');
    const context = e.positioningContext;
    const personal = context.nodes.find(n => n.source === 'personal');
    assert.ok(personal);
    assert.equal(canPosition(context, personal), true);
    assert.equal(canPosition({ ...context, ownerId: 'second-learner', canManageOfficial: false }, personal), false);
});
test('Question tree activation never writes selection; dirty existing Question retains authoring context', () => {
    const h = questions();
    draft(h);
    const before = h.calls.length;
    let e = h.render();
    const target = nodes(e.tree).find(n => n.type === 'button' && n.props?.['aria-label']?.includes('question sourcing'));
    assert.ok(target);
    target.props.onClick();
    assert.equal(h.calls.length, before);
    assert.equal(h.render().questionPrompt, 'Question?');
});
test('structural handlers retain parent ownership and separate state channels', () => {
    const questionTree = source.slice(source.indexOf('function renderQuestionTopic'), source.indexOf('function renderPrerequisiteBrowseTopic'));
    assert.match(questionTree, /TopicDragHandle topicKey=\{topic.key\}/);
    assert.match(source, /onMove=\{positionTopicFromTree\}/);
    assert.match(source, /outcome\.message/);
    assert.match(source, /\{questionStatus &&/);
    assert.match(source, /function showStatus/);
});
test('learner and second learner authority cannot become staff through navigation; unauthenticated capabilities reject', () => {
    for (const userId of ['owner', 'second-learner']) {
        const cap = deriveCreatorCapabilities({ userId, role: 'learner', library: { activeLibraryId: 'library', canAccessActiveLibrary: true, canManageActiveLibrary: false } });
        assert.equal(cap.official.saveQuestion, false);
        assert.equal(cap.official.manageTopicTree, false);
    }
    const h = editor({ role: 'learner', placed: true });
    const tabs = nodes(h.render().tree).find(n => n.type?.name === 'CreatorStudioTabs');
    assert.deepEqual(nodes(expandChrome(tabs)).filter(n => n.type === 'button').map(n => text(n)), ['Questions', 'Flagged']);
    assert.equal(h.reads.filter(r => r.rpc === 'search_creator_questions_with_media').length, 0);
    assert.throws(() => deriveCreatorCapabilities({ userId: '', role: 'learner', library: { activeLibraryId: null, canAccessActiveLibrary: false, canManageActiveLibrary: false } }), /verified user ID/);
    const route = read('app/creator/concepts/new/page.tsx');
    assert.match(route, /redirect\(['"]\/login/);
});
test('released SQL contracts retain Primary/Related inclusion, newest ordering, versions and staff authority', () => {
    const sql = read('supabase/084_question_additional_testing_angles.sql');
    assert.match(sql, /q\.concept_id = p_concept_id or exists/);
    assert.match(sql, /order by q\.created_at desc, q\.id desc/);
    assert.match(sql, /perform public\.append_question_version_snapshot\(saved_question\.id, caller_id\)/);
    assert.match(sql, /current_version_id = new_version_id/);
    assert.match(sql, /if not public.is_editor_or_admin\(\) then/);
    assert.match(sql, /A Question cannot be moved to another Concept during save/);
});
test('render and invalid no-Concept save issue no mutation', async () => {
    const h = questions();
    let e = h.render();
    assert.equal(h.calls.length, 0);
    assert.equal(h.reads.length, 0);
    e.setQuestionPrompt('Question');
    e.setQuestionAnswer('Answer');
    await h.render().saveCurrentQuestion();
    assert.equal(h.calls.length, 0);
    assert.match(h.render().questionStatus.message, /concept/i);
});
test('discard acceptance permits explicit New; busy standalone prevents any Question discard transition', () => {
    const h = questions();
    draft(h);
    h.render().startNewQuestion();
    assert.equal(h.render().questionPrompt, '');
    assert.equal(h.confirmations.length, 1);
    const e = h.render();
    e.standaloneEditorRef.current.busy = true;
    assert.equal(e.confirmDiscardQuestionChanges(), false);
    assert.equal(h.confirmations.length, 1);
});
test('search effect is staff Search-only and initializes once per Library', async () => {
    for (const role of ['admin', 'editor', 'learner']) {
        const h = editor({ role });
        h.render();
        h.runEffect('questionSearchLibraryRef.current ===');
        await settle();
        assert.equal(h.reads.filter(r => r.rpc === 'search_creator_questions_with_media').length, 0);
        h.render().setActiveCreatorTab('search');
        h.render();
        h.runEffect('questionSearchLibraryRef.current ===');
        await settle();
        h.render();
        h.runEffect('questionSearchLibraryRef.current ===');
        await settle();
        assert.equal(h.reads.filter(r => r.rpc === 'search_creator_questions_with_media').length, role === 'learner' ? 0 : 1);
    }
});
test('missing Library read authority rejects before rendering or search dispatch', () => {
    const h = questions();
    h.props.activeLibraryId = null;
    h.props.creatorCapabilities = deriveCreatorCapabilities({ userId: 'owner', role: 'admin', library: { activeLibraryId: null, canAccessActiveLibrary: false, canManageActiveLibrary: false } });
    assert.throws(() => h.render(), /verified read authority/);
    assert.equal(h.reads.length, 0);
});
test('search failure clears a fresh page but retains loaded rows on append failure', async () => {
    let fail = false;
    const h = questions({ response: name => name === 'search_creator_questions_with_media' ? (fail ? { data: null, error: { message: 'Synthetic search failure' } } : { data: [row()], error: null }) : undefined });
    await h.render().loadQuestionSearchPage(emptyFilters, null, false);
    fail = true;
    await h.render().loadQuestionSearchPage(emptyFilters, { id: 'q1', createdAt: '2026-01-02' }, true);
    assert.equal(h.render().questionSearchResults[0].id, 'q1');
    assert.match(h.render().questionSearchError, /Synthetic search failure/);
    await h.render().loadQuestionSearchPage(emptyFilters, null, false);
    assert.equal(h.render().questionSearchResults.length, 0);
});
test('Questions personal Topic names remain non-activating; Concept choice selects personal Card context', () => {
    const h = questions({ placed: true });
    let e = h.render();
    const personal = e.visibleTopicComposition.officialRoots[0].children.find(n => n.source === 'personal');
    assert.ok(personal);
    let tree = e.renderPersonalQuestionTopic(personal);
    const name = nodes(tree).find(n => n.props?.title === 'Personal Topic');
    assert.equal(name.type, 'span');
    assert.equal(name.props.onClick, undefined);
    assert.ok(nodes(tree).some(n => n.type?.name === 'TopicDragHandle'));
    nodes(tree).find(n => n.props?.['data-concept-disclosure'] === 'questions').props.onClick({stopPropagation() {}});
    e = h.render();
    tree = e.renderPersonalQuestionTopic(personal);
    const checkbox = nodes(tree).find(n => n.type === 'input' && n.props.type === 'checkbox');
    assert.ok(checkbox);
    checkbox.props.onChange();
    e = h.render();
    assert.equal(e.personalQuestionConceptId, 'mine-concept');
    assert.equal(e.questionSource, 'personal');
    assert.equal(e.questionPrompt, 'Personal Question');
    assert.equal(h.calls.length, 0);
});
test('Questions preserves official order and locale personal ties; Content uses canonical byte-order ties', () => {
    const h = questions({ placed: true });
    h.props.initialTopics = [{ id: 'topic', name: 'Root', children: [{ id: 'z', name: 'Zulu', children: [] }, { id: 'a', name: 'Alpha', children: [] }] }];
    h.props.initialPersonalContent.topics = [{ id: 'p-z', owner_id: 'owner', parent_id: null, name: 'Zulu Personal', sort_order: 0 }, { id: 'p-a', owner_id: 'owner', parent_id: null, name: 'alpha Personal', sort_order: 0 }];
    h.props.initialPersonalContent.topicPlacements = h.props.initialPersonalContent.topics.map(t => ({ id: 'place-' + t.id, owner_id: 'owner', personal_topic_id: t.id, library_node_id: 'topic' }));
    // A fresh instance is required: initial topics are intentionally state-owned, not prop-synchronized here.
    const fresh = editor({ placed: true });
    Object.assign(fresh.props, h.props);
    let e = fresh.render();
    e.setActiveCreatorTab('questions');
    e = fresh.render();
    assert.deepEqual(plain(e.visibleTopicComposition.officialRoots[0].children.map(n => n.id)), ['z', 'a', 'p-a', 'p-z']);
    e.setActiveCreatorTab('content');
    e = fresh.render();
    assert.deepEqual(plain(e.visibleTopicComposition.officialRoots[0].children.map(n => n.id)), ['z', 'a', 'p-z', 'p-a']);
});
test('structural permission failure leaves Question draft intact and routes status into Questions', async () => {
    const h = questions({ response: name => name === 'position_personal_topic' ? { data: null, error: { code: '42501', message: 'Denied' } } : undefined });
    draft(h);
    await h.render().positionTopicFromTree({ key: 'personal:topic:mine-topic', rpc: 'position_personal_topic', args: { p_topic_id: 'mine-topic' }, noop: false, destinationKey: 'official:topic:topic' });
    const e = h.render();
    assert.equal(e.questionPrompt, 'Question?');
    assert.equal(e.questionAnswer, 'Answer');
    assert.equal(e.status, null);
    assert.match(e.questionStatus.message, /permission/);
    assert.match(text(expandChrome(e.tree)), /You do not have permission to move/);
});
test('cross-owner personal tree input rejects; other-owned standalone result never opens', () => {
    const h = editor({ role: 'learner', placed: true });
    h.props.initialPersonalContent.topics[0].owner_id = 'second-learner';
    assert.throws(() => h.render(), /owner boundary/);
    const staff = questions();
    staff.render().setStandaloneCards([{ id: 'foreign', owner_id: 'second-learner', concept_id: null, library_node_id: 'topic', library_id: 'library', personal_topic_id: null, question: 'Foreign', answer: 'Answer' }]);
    staff.render().selectExistingQuestion(question({ source: 'personal', kind: 'card', id: 'foreign', conceptId: null }));
    assert.equal(staff.render().standaloneRequest, null);
    assert.equal(staff.calls.length, 0);
});
test('staff without manageable Library cannot dispatch official save', async () => {
    const h = questions();
    h.props.creatorCapabilities = deriveCreatorCapabilities({ userId: 'owner', role: 'editor', library: { activeLibraryId: 'library', canAccessActiveLibrary: true, canManageActiveLibrary: false } });
    draft(h);
    await assert.rejects(h.render().saveCurrentQuestion(), /not permitted/);
    assert.equal(h.calls.filter(c => c.name === 'save_question_with_format').length, 0);
});
test('Existing Questions effect cleanup blocks stale completion; failed current load shows error', async () => {
    const pending = [];
    const h = questions({ response: name => name === 'get_creator_questions_with_media' ? new Promise(resolve => pending.push(resolve)) : undefined });
    h.render().setQuestionConceptId('primary');
    h.render();
    const cleanup = h.runEffect('async function loadExistingQuestions');
    assert.equal(typeof cleanup, 'function');
    cleanup();
    h.render().setQuestionConceptId('next');
    h.render();
    h.runEffect('async function loadExistingQuestions');
    pending[0]({ data: [row({ id: 'stale' })], error: null });
    await settle();
    assert.equal(h.render().existingQuestions.length, 0);
    pending[1]({ data: null, error: { message: 'Denied' } });
    await settle();
    assert.equal(h.render().existingQuestions.length, 0);
    assert.match(h.render().questionStatus.message, /Existing questions could not be loaded/);
});
test('search submit, clear and Load More dispatch applied filters exactly once', async () => {
    const h = questions({ response: name => name === 'search_creator_questions_with_media' ? { data: Array.from({ length: 51 }, (_, i) => row({ id: 'q' + i })), error: null } : undefined });
    let e = h.render();
    e.setQuestionSearchFilters({ ...emptyFilters, text: 'needle' });
    let prevented = 0;
    h.render().submitQuestionSearch({ preventDefault() { prevented++; } });
    await settle();
    assert.equal(prevented, 1);
    e = h.render();
    e.setQuestionSearchFilters({ ...emptyFilters, text: 'not applied' });
    h.render().loadMoreQuestionSearchResults();
    await settle();
    let calls = h.calls.filter(c => c.name === 'search_creator_questions_with_media');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].payload.p_search_text, 'needle');
    assert.equal(calls[1].payload.p_before_id, 'q49');
    h.render().clearQuestionSearch();
    await settle();
    calls = h.calls.filter(c => c.name === 'search_creator_questions_with_media');
    assert.equal(calls.length, 3);
    assert.equal(calls[2].payload.p_search_text, null);
    assert.equal(h.render().questionSearchFilters.text, '');
});
test('personal search filters stored source and remains owner-context bounded', () => {
    const h = questions();
    let e = h.render();
    assert.equal(e.filterPersonalCardsForSearch({ ...emptyFilters, text: 'Personal Question' }).length, 1);
    assert.equal(e.filterPersonalCardsForSearch({ ...emptyFilters, text: 'absent' }).length, 0);
    assert.equal(e.filterPersonalCardsForSearch({ ...emptyFilters, difficulty: 'hard' }).length, 0);
    e.selectQuestionSearchResult(question({ source: 'personal', kind: 'card', id: 'missing-other-owner', conceptId: 'mine-concept' }));
    e = h.render();
    assert.equal(e.questionId, null);
    assert.match(e.questionStatus.message, /unavailable/);
    assert.equal(h.calls.length, 0);
});

test('Existing Questions rendered keys distinguish official Questions from personal Cards sharing a UUID', () => {
    const h = questions();
    const e = h.render();
    e.setQuestionConceptId('primary');
    e.setExistingQuestions([question({id:'shared'}), question({id:'shared', source:'personal', kind:'card'})]);
    const list = nodes(h.render().tree).find(n => n.props?.['aria-label'] === 'Existing Questions, newest first');
    assert.deepEqual(nodes(list).filter(n => n.type === 'button').map(n => n.key), ['official:question:shared','personal:card:shared']);
});

function questionSnapshot(h) {
    const e = h.render();
    const fields = ['questionId', 'questionSource', 'questionPrompt', 'questionAnswer', 'questionDifficulty', 'questionTestingAngle', 'questionRecordStatus', 'questionConceptId', 'primaryQuestionConceptId', 'editingQuestionPrimary', 'questionTopicId', 'questionRelatedConceptIds', 'questionAdditionalTestingAngles', 'questionTags', 'questionEditorState', 'questionStatus', 'isQuestionDirty'];
    return Object.fromEntries(fields.map(key => [key, plain(e[key])]));
}
function selectTab(h, tab) {
    const tabs = nodes(h.render().tree).find(n => n.type?.name === 'CreatorStudioTabs');
    assert.ok(tabs);
    tabs.props.onSelect(tab);
}
for (const role of ['admin', 'editor']) {
    test(`${role}: Questions layout keeps writing first, Existing Questions last after Tags, Search separate`, () => {
        const h = questions({ role });
        const tree = expandChrome(h.render().tree);
        const content = text(tree);
        assert.doesNotMatch(content, /Library Question Search|Related Concepts · authoring only|Related Concepts choices/);
        const ordered = ['1. Question / Answer', '2. Topic Tree', '3. Additional Options', 'Add a question tag', 'Existing Questions · Newest first', 'New Questions are saved as Published'];
        let position = -1;
        for (const label of ordered) { const next = content.indexOf(label); assert.ok(next > position, label); position = next; }
        const existing = nodes(tree).find(n => n.props?.['aria-label'] === 'Concept-specific Existing Questions');
        assert.equal(existing.type, 'section');
        assert.match(text(existing), /Select a Concept to view its existing Questions/);
        selectTab(h, 'search');
        const search = text(expandChrome(h.render().tree));
        assert.match(search, /Library Question Search/);
        assert.doesNotMatch(search, /1\. Question \/ Answer/);
        assert.equal(h.calls.length, 0);
    });
    for (const existing of [false, true]) {
        test(`${role}: ${existing ? 'existing' : 'new'} Question draft survives Search round-trip without prompt or write`, () => {
            const h = questions({ role, confirm: () => false });
            h.render().selectQuestionConcept('primary', 'topic');
            if (existing) h.render().selectExistingQuestion(question());
            const e = h.render();
            e.setQuestionPrompt('Unsaved question');
            e.setQuestionAnswer('Unsaved answer');
            e.setQuestionDifficulty('hard');
            e.setQuestionTestingAngle('Priority');
            e.setQuestionRecordStatus('draft');
            e.setQuestionRelatedConceptIds(['related', 'other']);
            e.setQuestionAdditionalTestingAngles(['Safety']);
            e.setQuestionTags([{ id: 'tag', name: 'Tag', slug: 'tag', status: 'active' }]);
            const before = questionSnapshot(h);
            assert.equal(before.isQuestionDirty, true);
            selectTab(h, 'search');
            assert.equal(h.render().activeCreatorTab, 'search');
            assert.deepEqual(questionSnapshot(h), before);
            assert.equal(h.render().isDirty, true);
            selectTab(h, 'questions');
            assert.equal(h.render().activeCreatorTab, 'questions');
            assert.deepEqual(questionSnapshot(h), before);
            assert.equal(h.confirmations.length, 0);
            assert.equal(h.calls.length, 0);
        });
    }
    test(`${role}: same Search result preserves the dirty draft; different result retains released discard guard`, () => {
        let accept = false;
        const h = questions({ role, confirm: () => accept });
        h.render().selectQuestionConcept('primary', 'topic');
        h.render().selectExistingQuestion(question());
        h.render().setQuestionPrompt('Unsaved replacement');
        h.render().setQuestionAnswer('Unsaved answer');
        h.render().setQuestionDifficulty('hard');
        const before = questionSnapshot(h);
        selectTab(h, 'search');
        h.render().selectQuestionSearchResult(question());
        assert.equal(h.render().activeCreatorTab, 'questions');
        assert.deepEqual(questionSnapshot(h), before);
        assert.equal(h.confirmations.length, 0);
        selectTab(h, 'search');
        h.render().selectQuestionSearchResult(question({ id: 'q2', prompt: 'Different persisted Question' }));
        assert.equal(h.render().activeCreatorTab, 'search');
        assert.deepEqual(questionSnapshot(h), before);
        assert.equal(h.confirmations.length, 1);
        accept = true;
        h.render().selectQuestionSearchResult(question({ id: 'q2', prompt: 'Different persisted Question' }));
        assert.equal(h.render().activeCreatorTab, 'questions');
        assert.equal(h.render().questionId, 'q2');
        assert.equal(h.render().questionPrompt, 'Different persisted Question');
        assert.equal(h.render().primaryQuestionConceptId, 'primary');
        assert.equal(h.render().isQuestionDirty, false);
        assert.equal(h.confirmations.length, 2);
        assert.equal(h.calls.length, 0);
    });
    test(`${role}: in-flight Question save blocks Search until completion`, async () => {
        let finish;
        const h = questions({ role, response: name => name === 'save_question_with_format' ? new Promise(resolve => { finish = resolve; }) : undefined });
        const e = draft(h);
        const before = questionSnapshot(h);
        const staleTabs = nodes(e.tree).find(n => n.type?.name === 'CreatorStudioTabs');
        const saving = e.saveCurrentQuestion();
        staleTabs.props.onSelect('search');
        e.selectQuestionSearchResult(question({ id: 'q2' }));
        assert.deepEqual(questionSnapshot(h), before, 'synchronous save lock protects callbacks captured before busy rerender');
        selectTab(h, 'search');
        h.render().selectQuestionSearchResult(question({ id: 'q2' }));
        assert.equal(h.render().activeCreatorTab, 'questions');
        assert.equal(h.confirmations.length, 0);
        finish({ data: null, error: { message: 'Synthetic failure' } });
        await saving;
        assert.equal(h.render().questionPrompt, 'Question?');
    });
    test(`${role}: Search result and same-selected result return to the existing editor`, () => {
        const h = questions({ role });
        h.render().setQuestionConceptsByTopicId({ topic: [{ id: 'primary', name: 'Primary' }] });
        selectTab(h, 'search');
        h.render().selectQuestionSearchResult(question());
        let e = h.render();
        assert.equal(e.activeCreatorTab, 'questions');
        assert.equal(e.questionId, 'q1');
        assert.equal(e.primaryQuestionConceptId, 'primary');
        assert.deepEqual(plain(e.questionRelatedConceptIds), ['related']);
        selectTab(h, 'search');
        h.render().selectQuestionSearchResult(question());
        e = h.render();
        assert.equal(e.activeCreatorTab, 'questions');
        assert.equal(e.questionId, 'q1');
        assert.equal(h.confirmations.length, 0);
        assert.equal(h.calls.length, 0);
    });
}
test('Search cannot hide a retained Question draft from the existing shell guard', () => {
    const h = questions({ confirm: () => false });
    draft(h);
    selectTab(h, 'content');
    selectTab(h, 'search');
    assert.equal(h.render().isDirty, true);
    assert.equal(h.runShellGuard(), false);
    assert.equal(h.render().questionPrompt, 'Question?');
});

for (const role of ['admin', 'editor']) {
 test(`${role}: tree associations and browsing are independent; promotion is draft-only`, async () => {
  const h = questions({role});
  h.render().setQuestionConceptsByTopicId({topic:[{id:'primary',name:'Primary'},{id:'related',name:'Related'},{id:'other',name:'Other'}]});
  h.render().associateQuestionConcept('primary',true);
  h.render().associateQuestionConcept('related',true);
  let e=h.render();e.setQuestionPrompt('Draft question');e.setQuestionAnswer('Draft answer');
  const dirtyBefore=h.render().isQuestionDirty;
  h.render().browseQuestionConcept('other','topic');
  e=h.render();assert.equal(e.primaryQuestionConceptId,'primary');assert.equal(e.questionConceptId,'other');
  assert.equal(e.questionAnswer,'Draft answer');assert.equal(e.isQuestionDirty,dirtyBefore);assert.equal(h.confirmations.length,0);
  e.makeQuestionConceptPrimary('related');e=h.render();
  assert.equal(e.primaryQuestionConceptId,'related');assert.deepEqual(plain(e.questionRelatedConceptIds),['primary']);
  e.associateQuestionConcept('related',false);assert.equal(h.render().primaryQuestionConceptId,'related');
  await h.render().saveCurrentQuestion();e=h.render();
  assert.equal(e.primaryQuestionConceptId,'related','successful save carries actual Primary, not browse');
  assert.equal(e.questionConceptId,'other');assert.equal(e.questionAnswer,'');assert.equal(e.isQuestionDirty,false);
  e.startNewQuestion();e=h.render();assert.equal(e.primaryQuestionConceptId,'other');assert.deepEqual(plain(e.questionRelatedConceptIds),[]);
  e.selectExistingQuestion(question());e=h.render();e.makeQuestionConceptPrimary('related');
  assert.equal(h.render().primaryQuestionConceptId,'primary');assert.equal(h.render().questionId,'q1');
  e.associateQuestionConcept('related',false);assert.deepEqual(plain(h.render().questionRelatedConceptIds),[]);
 });
 test(`${role}: tree selection stays visible under Needs Questions and duplicate placements`, () => {
  const h=questions({role});h.render().setQuestionConceptsByTopicId({topic:[{id:'primary',name:'Primary'},{id:'related',name:'Related'}],other:[{id:'primary',name:'Primary'}]});
  h.render().setQuestionCountsByConceptId({primary:3,related:2});
  h.render().associateQuestionConcept('primary',true);h.render().associateQuestionConcept('related',true);
  h.render().setNeedsQuestionsOnly(true);h.render().setConceptPlacementStatus('ready');
  for (const id of ['topic','other']) {
   h.render().renderConceptCountControl({id,key:`official:topic:${id}`,source:'official',name:id,children:[]}, 'questions').props.onClick({stopPropagation() {}});
  }
  const e=h.render();
  for(const id of ['topic','other']) {
   const tree=e.renderQuestionTopic({id,key:`official:topic:${id}`,source:'official',name:id,children:[]});
   const check=nodes(tree).find(n=>n.props?.['aria-label']==='Associate Primary with Question');
   assert.equal(check.props.checked,true);assert.equal(check.props.disabled,true);
  }
  const tree=e.renderQuestionTopic({id:'topic',key:'official:topic:topic',source:'official',name:'Topic',children:[]});
  assert.ok(text(tree).includes('Related'));
  assert.ok(nodes(tree).some(n=>n.props?.['aria-label']==='Make Related Primary'));
 });
 test(`${role}: failed association save preserves draft and relationship selection`, async()=>{
  const h=questions({role,response:name=>name==='save_question_with_format'?{data:null,error:{message:'Rejected'}}:undefined});
  h.render().setQuestionConceptsByTopicId({topic:[{id:'primary',name:'Primary'},{id:'related',name:'Related'}]});
  h.render().associateQuestionConcept('primary',true);h.render().associateQuestionConcept('related',true);
  h.render().setQuestionPrompt('Draft');h.render().setQuestionAnswer('Answer');await h.render().saveCurrentQuestion();
  const e=h.render();assert.equal(e.primaryQuestionConceptId,'primary');assert.deepEqual(plain(e.questionRelatedConceptIds),['related']);assert.equal(e.questionAnswer,'Answer');assert.equal(e.isQuestionDirty,true);
 });
}

for (const role of ['admin', 'editor']) test(`${role}: server-qualified Article handoff loads actual Question identity and independent markers exactly once`, () => {
  const h = editor({ role });
  h.props.initialQuestion = row({ prompt_format: 'visual_markdown_v1', current_version_id: 'question-version', question_type: 'short_answer', question_accepted_answers: [{ id: 'answer-id', answer_text: '1. legacy answer', answer_format: 'legacy', sort_order: 0 }] });
  h.render(); h.runEffect('questionHandoffHandler.current ='); h.runEffect('initialQuestionLoaded.current');
  let e = h.render();
  assert.equal(e.activeCreatorTab, 'questions'); assert.equal(e.questionId, 'q1'); assert.equal(e.primaryQuestionConceptId, 'primary');
  const fields = nodes(e.tree).filter(n => n.type?.name === 'QuestionMarkdownField');
  assert.deepEqual(fields.map(f => f.props.format), ['visual_markdown_v1', 'legacy']);
  assert.equal(e.questionAnswer, '1. legacy answer'); assert.equal(e.isQuestionDirty, false); assert.equal(h.calls.length, 0);
  fields[0].props.onChange('Retained edit', 'visual_markdown_v1'); e = h.render();
  h.runEffect('questionHandoffHandler.current ='); h.runEffect('initialQuestionLoaded.current');
  assert.equal(h.render().questionPrompt, 'Retained edit'); assert.equal(h.render().isQuestionDirty, true); assert.equal(h.calls.length, 0);
});
