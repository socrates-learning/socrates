import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { organizer, source, fixture, nodes, text, button, control } from './fixtures/library-organizer.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const css = read('components/LibraryOrganizerClient.module.css');
async function row(h, name) {
  const match = nodes(h.current.tree).filter(n => n.type === 'button' && n.props.className?.includes('hierarchyRow') && text(n).startsWith(name));
  assert.equal(match.length, 1, `Expected exact unique hierarchy entry for ${name}`);
  match[0].props.onClick();
  return h.settle();
}
const response = { data: null, error: null };

test('Organizer hooks, reads, derivations and mutation handlers preserve the released byte fingerprint', () => {
  const start = source.indexOf('export function LibraryOrganizerClient()');
  const end = source.indexOf('  function renderGroup');
  assert.equal(hash(source.slice(start, end)), '50a90106baf20d3c32698180ad6121240106cad11eccccb57105492f37245338');
  assert.notEqual(hash(source.slice(start, end).replace("p_record_type: 'group'", "p_record_type: 'library'")), '50a90106baf20d3c32698180ad6121240106cad11eccccb57105492f37245338');
});

test('every existing event, disabled gate, value and navigation destination remains exact', () => {
  function contract(value) {
    const ast = ts.createSourceFile('Organizer.tsx', value, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const attributes = [];
    function visit(node) {
      if (ts.isJsxAttribute(node) && /^(on[A-Z]|disabled$|value$|href$)/.test(node.name.getText(ast))) attributes.push(node.getText(ast));
      ts.forEachChild(node, visit);
    }
    visit(ast); return { count: attributes.length, hash: hash(attributes.join('\n')) };
  }
  assert.deepEqual(contract(source), { count: 57, hash: '068ebb4eae549fe1915e59e64bc4a3e5ab099a163aee69fe8c32e4e2ee189f49' });
  assert.notEqual(contract(source.replace('setSelectedLibraryId(library.id)', 'setSelectedLibraryId(null)')).hash, contract(source).hash);
});

test('presentation is Organizer-scoped, reuses released tokens and introduces no extra controls', () => {
  assert.match(source, /import creatorStyles from '\.\/CreatorStudioV2Client\.module\.css'/);
  assert.match(source, /creatorStyles\.staffWorkspace/);
  assert.match(source, /Use Library Organizer to manage your Library Groups and Libraries\./);
  assert.match(source, /<h1>Library Organizer<\/h1>/);
  assert.doesNotMatch(source, /Expand All|Collapse|expandedGroup|\/library\/switch|router\.push|fetch\(/);
  for (const token of ['--creator-navy', '--creator-muted', '--creator-border', '--creator-soft']) assert.ok(css.includes(token));
  assert.match(css, /\.hierarchyRow\[aria-pressed='true'\]/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(hover: hover\)/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /max-width: 900px/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /overflow:\s*(hidden|clip)|position:\s*(fixed|sticky)|:global|(^|\n)(body|html)\b/);
});

test('load uses the same four reads and selection is management-only', async () => {
  const h = organizer(); const e = await h.settle();
  assert.deepEqual(h.reads, [
    { table: 'library_groups', select: 'id, parent_id, name, slug, sort_order, status', order: ['sort_order', 'name'] },
    { table: 'library_group_libraries', select: 'group_id, library_id, sort_order', order: ['sort_order'] },
    { table: 'libraries', select: 'id, name, slug, description, status', order: ['name'] },
    { table: 'library_nodes', select: 'id, library_id, parent_id, name', order: [] },
  ]);
  assert.equal(e.selectedGroupId, 'group-a'); assert.equal(e.selectedLibraryId, null);
  assert.equal(nodes(e.tree).filter(n => n.type === 'Header').length, 1);
  assert.equal(nodes(e.tree).find(n => n.type === 'a').props.href, '/creator/concepts/new');
  await row(h, 'Library A');
  assert.equal(h.current.selectedLibraryId, 'library-a'); assert.equal(h.current.selectedGroupId, 'group-a');
  assert.equal(control(h.current.tree, 'Selected Library name').props.value, 'Library A');
  assert.match(text(h.current.tree), /Stable Library UUID: library-a/);
  assert.match(text(h.current.tree), /Internal Topic Tree nodes: 2/);
  assert.equal(h.calls.length, 0); assert.equal(h.reads.length, 4);
  await row(h, 'Empty Group'); assert.equal(h.current.selectedLibraryId, null);
});

test('nested/empty/archived Groups and unorganized Libraries remain present without collapse', async () => {
  const h = organizer(); const e = await h.settle();
  const rows = nodes(e.tree).filter(n => n.type === 'button' && n.props.className?.includes('hierarchyRow'));
  assert.deepEqual(rows.map(n => text(n)), ['Health SciencesGroup','Library ALibrary','Nested GroupGroup','Library BLibrary · inactive','Empty GroupGroup','Archived GroupGroup · archived','Unorganized Library']);
  assert.deepEqual(rows.slice(0, 4).map(n => n.props.style.paddingLeft), [10, 26, 26, 42]);
  await row(h, 'Unorganized Library'); assert.equal(h.current.selectedGroupId, null); assert.equal(h.current.selectedLibraryId, 'library-unorganized');
  assert.equal(button(h.current.tree, 'Create child Group').props.disabled, true);
});

for (const [label, selected, parent] of [['Create top-level Group', 'Nested Group', null], ['Create child Group', 'Health Sciences', 'group-a'], ['Create sibling Group', 'Nested Group', 'group-a']]) {
  test(`${label} preserves its exact parent and fresh load`, async () => {
    const h = organizer({ rpc: () => response }); await h.settle(); await row(h, selected);
    await h.change('Group name', '  New Group  '); await h.click(label);
    assert.deepEqual(h.calls, [{ name: 'create_library_group', payload: { p_parent_id: parent, p_name: 'New Group' } }]);
    assert.equal(h.reads.length, 8); assert.equal(h.current.isMutating, false);
  });
}

test('blank creation remains rejected without a write and empty Groups are valid selection', async () => {
  const h = organizer({ data: { ...fixture, library_groups: [], library_group_libraries: [] } }); await h.settle();
  assert.equal(h.current.selectedGroupId, null);
  await h.click('Create top-level Group'); assert.equal(h.current.status.text, 'Enter a Group name.');
  await h.click('Create Library with root Topic Tree'); assert.equal(h.current.status.text, 'Enter a Library name and choose an active Group.');
  assert.equal(h.calls.length, 0);
});

test('Group rename, move, sibling reorder and invalid-destination filtering retain handlers', async () => {
  const h = organizer(); await h.settle();
  assert.deepEqual(nodes(control(h.current.tree, 'Group parent')).filter(n => n.type === 'option').map(n => n.props.value), ['', 'group-empty']);
  await h.change('Group name', ' Renamed '); await h.click('Rename Group');
  await h.change('Group parent', 'group-empty'); await h.click('Move Group');
  await h.click('Move up'); await h.click('Move down');
  assert.deepEqual(h.calls, [
    { name: 'rename_library_group', payload: { p_group_id: 'group-a', p_name: 'Renamed' } },
    { name: 'move_library_group', payload: { p_group_id: 'group-a', p_new_parent_id: 'group-empty' } },
    { name: 'reorder_library_group', payload: { p_group_id: 'group-a', p_direction: 'up' } },
    { name: 'reorder_library_group', payload: { p_group_id: 'group-a', p_direction: 'down' } },
  ]);
});

test('Group archive retains its two-step confirmation and selection resets pending confirmation', async () => {
  const h = organizer(); await h.settle(); await h.click('Archive Group');
  assert.equal(h.calls.length, 0); assert.equal(h.current.pendingArchiveGroupId, 'group-a');
  await row(h, 'Empty Group'); assert.equal(h.current.pendingArchiveGroupId, null);
  await row(h, 'Health Sciences'); await h.click('Archive Group'); await h.click('Confirm archive');
  assert.deepEqual(h.calls, [{ name: 'archive_library_group', payload: { p_group_id: 'group-a' } }]);
  await row(h, 'Archived Group'); assert.equal(button(h.current.tree, 'Archive Group').props.disabled, true);
});

test('Library creation preserves Group, optional description, reload and exact newly created selection', async () => {
  const data = structuredClone(fixture);
  const h = organizer({ data, rpc: (name, args) => {
    assert.equal(name, 'create_library_with_root');
    data.libraries = [...data.libraries, { id: 'created', name: args.p_name, status: 'active' }];
    data.library_group_libraries = [...data.library_group_libraries, { group_id: args.p_group_id, library_id: 'created', sort_order: 1 }];
    return { data: { library_id: 'created' }, error: null };
  } });
  await h.settle(); await h.change('New Library name', '  New Library  '); await h.change('New Library description', '  Description  '); await h.change('New Library Group', 'group-empty');
  await h.click('Create Library with root Topic Tree');
  assert.deepEqual(h.calls, [{ name: 'create_library_with_root', payload: { p_group_id: 'group-empty', p_name: 'New Library', p_description: 'Description' } }]);
  assert.equal(h.current.selectedLibraryId, 'created'); assert.equal(h.current.selectedGroupId, 'group-empty');
  assert.equal(control(h.current.tree, 'New Library name').props.value, ''); assert.equal(control(h.current.tree, 'New Library description').props.value, '');
});

test('Library rename, canonical placement, statuses and unrelated Group selection remain independent', async () => {
  const h = organizer(); await h.settle(); await row(h, 'Library A');
  await h.change('Selected Library name', ' Renamed A '); await h.click('Rename Library and root');
  await h.change('Selected Library Group', 'group-empty'); await h.click('Move Library');
  for (const value of ['inactive', 'archived', 'active']) { await h.change('Selected Library status', value); await h.click('Save Library status'); }
  assert.deepEqual(h.calls, [
    { name: 'rename_library_with_root', payload: { p_library_id: 'library-a', p_name: 'Renamed A' } },
    { name: 'move_library_to_group', payload: { p_library_id: 'library-a', p_group_id: 'group-empty' } },
    ...['inactive','archived','active'].map(p_status => ({ name: 'set_library_organizer_status', payload: { p_library_id: 'library-a', p_status } })),
  ]);
  assert.equal(h.current.selectedLibraryId, 'library-a');
});

for (const kind of ['Group', 'Library']) {
  test(`${kind} deletion preserves exact impact, Cancel, failure and confirmed identity`, async () => {
    let approve = false, failure = null; const warning = `Exact ${kind} impact warning`;
    const h = organizer({ confirm: value => { assert.equal(value, warning); return approve; }, rpc: name => name === 'get_development_delete_summary' ? { data: { warning }, error: null } : { data: null, error: failure } });
    await h.settle(); if (kind === 'Library') await row(h, 'Library A');
    await h.click(`Delete ${kind}`);
    assert.equal(h.calls.length, 1); assert.equal(h.reads.length, 4); assert.equal(h.current.isMutating, false);
    approve = true; failure = { message: 'Deletion denied' }; await h.click(`Delete ${kind}`);
    assert.equal(h.current.status.text, 'Deletion denied'); assert.equal(h.current.selectedLibraryId, kind === 'Library' ? 'library-a' : null);
    failure = null; await h.click(`Delete ${kind}`);
    const id = kind === 'Library' ? 'library-a' : 'group-a';
    assert.deepEqual(h.calls.at(-1), { name: 'delete_development_content', payload: { p_record_type: kind.toLowerCase(), p_record_id: id } });
    assert.equal(h.confirmations.length, 3); assert.equal(h.reads.length, 8);
    if (kind === 'Library') assert.equal(h.current.selectedLibraryId, null);
  });
}

test('read, RPC and impact-summary errors are shown and never reported as success', async () => {
  const badRead = organizer({ read: query => ({ data: null, error: query.table === 'libraries' ? { message: 'Library read denied' } : null }) });
  await badRead.settle(); assert.equal(badRead.current.status.text, 'Library read denied'); assert.equal(badRead.current.isLoading, false); assert.equal(badRead.calls.length, 0);
  const h = organizer({ rpc: () => ({ data: null, error: { message: 'Permission denied' } }) });
  await h.settle(); await h.click('Rename Group'); assert.equal(h.current.status.text, 'Permission denied');
  await h.click('Delete Group'); assert.equal(h.confirmations.length, 0); assert.equal(h.calls.length, 2); assert.equal(h.reads.length, 4);
});

test('a missing impact warning prevents deletion and busy state retains existing write guards', async () => {
  const noWarning = organizer(); await noWarning.settle(); await noWarning.click('Delete Group');
  assert.equal(noWarning.calls.length, 1); assert.equal(noWarning.confirmations.length, 0);
  let release; const h = organizer({ rpc: () => new Promise(resolve => { release = resolve; }) }); await h.settle();
  const pending = h.current.renameSelectedGroup(); const busy = h.render();
  assert.equal(busy.isMutating, true); assert.equal(button(busy.tree, 'Rename Group').props.disabled, true);
  await busy.renameSelectedGroup(); assert.equal(h.calls.length, 1);
  await new Promise(resolve => setImmediate(resolve)); release(response); await pending; await h.settle();
  assert.equal(h.current.isMutating, false);
});
