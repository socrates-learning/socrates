import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { applyMarkdownEdit } from '../lib/markdown-editing.ts';
import { conceptMedia as m, ids, hookHarness, loadConceptModule, jsx } from './fixtures/concept-media-authoring.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
const conceptId = '11400000-0000-4000-8000-000000000020';
const versionId = '11400000-0000-4000-8000-000000000021';
const reservationId = '11400000-0000-4000-8000-000000000022';
const item = { placementId: ids.placement, assetId: ids.asset, ordinal: 0, altText: 'Original alt', caption: '', mime: 'image/png', width: 2, height: 2, sha256: 'a'.repeat(64) };
function setup(options = {}) {
  const hooks = hookHarness(), calls = [], focus = [];
  const props = { libraryId: ids.library, conceptId: null, enabled: true, source: '# ZZ Draft', baseSource: '', initialVersionId: null, ...options.props };
  const api = async (url, init = {}) => {
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method: init.method || 'GET', body });
    const override = await options.respond?.({ url, init, body });
    if (override) return override;
    if (body?.action === 'create') return Response.json({ draftId: body.draftId, state: 'open' });
    if (body?.action === 'reserve') return Response.json({ reservationId });
    if (init.method === 'PUT') return Response.json({ assetId: ids.asset, ready: true });
    if (url.includes('metadata=1')) return Response.json(item);
    if (body?.action === 'save') return Response.json({ concept_id: conceptId, version_id: versionId, bodyMarkdown: body.payload.p_body_markdown, placements: body.payload.placements });
    if (init.method === 'DELETE' || body?.action === 'abandon') return Response.json({ cancelled: true });
    return Response.json({ conceptId: props.conceptId, versionId, bodyMarkdown: props.baseSource, placements: [item] });
  };
  const mod = loadConceptModule('components/creator/ConceptImageAuthoring.tsx', { react: hooks.hooks, 'react/jsx-runtime': jsx, '@/lib/concept-media': m, '@/components/ConceptMediaContent': { VerifiedConceptImage() {} }, '@/components/ConceptMedia.module.css': {} }, { fetch: api, crypto: { randomUUID } });
  props.onSource = (source, selection) => { props.source = source; focus.push(selection); };
  const render = () => hooks.render(() => mod.useConceptImageAuthoring(props));
  render(); hooks.effects();
  return { ...mod, props, calls, focus, hooks, render };
}
async function uploaded(s) {
  s.render().open(3); s.render().changeMetadata('alt', 'Synthetic image');
  await s.render().upload(new Blob(['synthetic'], { type: 'image/png' }));
  return s.render();
}
test('new Concept image upload uses a genuine draft and creates no Concept or automatic save', async () => {
  const s = setup();
  const c = await uploaded(s);
  assert.equal(c.context.kind, 'draft'); assert.equal(c.dirty, true); assert.equal(c.guardActive, true);
  assert.deepEqual(s.calls.filter(x => x.body).map(x => x.body.action), ['create', 'reserve']);
  assert.equal(s.calls.some(x => x.url.includes(`/concepts/${conceptId}`)), false);
  c.insert(); const inserted = s.render();
  assert.match(s.props.source, /\[\[socrates-media:/); assert.equal(inserted.inspector, null);
  assert.equal(inserted.items[0].altText, 'Synthetic image'); assert.equal(s.focus.at(-1), s.props.source.length);
  assert.equal(s.calls.some(x => x.body?.action === 'save'), false);
});
test('Alt Text is required and token insertion does not overwrite text edited while inspector is open', async () => {
  const s = setup(); await uploaded(s);
  s.render().changeMetadata('alt', ''); s.render().insert(); assert.equal(s.props.source, '# ZZ Draft');
  s.render().changeMetadata('alt', 'Required'); s.props.source = 'Changed while uploading'; s.render().insert();
  assert.match(s.render().error, /text changed/); assert.equal(s.props.source, 'Changed while uploading');
});
test('first save sends one complete manifest; failure and lost response preserve source and retry identity', async () => {
  let fail = true;
  const s = setup({ respond: ({ body }) => body?.action === 'save' && fail ? Response.json({ error: 'Synthetic save failure' }, { status: 422 }) : null });
  (await uploaded(s)).insert();
  const original = s.props.source;
  const payload = { p_body_markdown: original, p_active_library_id: ids.library };
  assert.equal((await s.render().save(payload)).error.message, 'Synthetic save failure');
  assert.equal(s.props.source, original); assert.equal(s.render().items.length, 1); assert.equal(s.render().dirty, true);
  fail = false; assert.equal((await s.render().save(payload)).data.concept_id, conceptId);
  const saves = s.calls.filter(x => x.body?.action === 'save');
  assert.deepEqual(saves[0].body, saves[1].body);
  assert.equal(saves[0].body.payload.placements[0].reservationId, reservationId);
  s.render().reset(false); assert.equal(s.render().items.length, 0); assert.equal(s.render().context, null);
  assert.equal(s.calls.some(x => x.body?.action === 'abandon'), false, 'Consumed draft must not be abandoned');
});
test('existing Concept hydrates media, metadata changes are dirty and replacement keeps placement identity', async () => {
  const source = m.conceptMediaToken(ids.placement);
  const s = setup({ props: { conceptId, source, baseSource: source, initialVersionId: versionId } });
  await flush(); assert.equal(s.render().dirty, false);
  s.render().open(0, s.render().items[0]); s.render().changeMetadata('caption', 'Updated caption'); s.render().insert();
  assert.equal(s.render().dirty, true); assert.equal(s.props.source, source);
  assert.equal(s.focus.at(-1), source.length, 'Apply restores the editor caret after its existing token');
  s.render().open(0, s.render().items[0]); s.render().replace();
  await s.render().upload(new Blob(['replacement']));
  assert.equal(s.render().inspector.placement.placementId, ids.placement);
  s.render().insert(); assert.equal(s.render().items[0].caption, 'Updated caption');
  const result = await s.render().save({ p_body_markdown: source, p_active_library_id: ids.library });
  assert.equal(result.error, null); assert.equal(s.render().dirty, false);
});
test('removal changes only the draft; cancelled pending metadata leaves saved media intact', async () => {
  const source = `Before\n\n${m.conceptMediaToken(ids.placement)}\n\nAfter`;
  const s = setup({ props: { conceptId, source, baseSource: source } }); await flush();
  s.render().open(0, s.render().items[0]); s.render().changeMetadata('alt', 'Unsaved'); await s.render().close();
  assert.equal(s.render().items[0].altText, 'Original alt'); assert.equal(s.render().dirty, false);
  assert.equal(s.focus.at(-1), 0, 'Cancel restores the recorded editor position');
  s.render().remove(ids.placement); assert.equal(s.render().items.length, 0); assert.equal(s.render().dirty, true);
  assert.equal(s.focus.at(-1), source.indexOf(m.conceptMediaToken(ids.placement)), 'Remove restores the editor caret at the removed block');
  assert.equal(s.calls.some(x => x.body?.action === 'save' || x.method === 'DELETE'), false);
  assert.match(s.props.source, /Before[\s\S]*After/);
});
test('duplicate upload and save while inspector is open are blocked; late Library response cannot hydrate current context', async () => {
  let release;
  const s = setup({ respond: ({ init }) => init.method === 'PUT' ? new Promise(r => { release = r; }) : null });
  s.render().open(0);
  const pending = s.render().upload(new Blob(['image'])); await flush();
  await s.render().upload(new Blob(['duplicate']));
  assert.equal(s.calls.filter(c => c.method === 'PUT').length, 1);
  assert.match((await s.render().save({})).error.message, /Finish or cancel/);
  s.props.libraryId = '11200000-0000-4000-8000-000000000011'; s.render(); s.hooks.effects();
  release(Response.json({ assetId: ids.asset, ready: true })); await pending;
  assert.equal(s.render().items.length, 0); assert.equal(s.render().context, null); assert.equal(s.render().inspector, null);
});
test('unconfirmed cancellation retains actionable error and dirty state; confirmed abandonment clears only media state', async () => {
  let deny = true;
  const s = setup({ respond: ({ init }) => init.method === 'DELETE' && deny ? Response.json({ error: 'Unavailable' }, { status: 503 }) : null });
  await uploaded(s); await s.render().close();
  assert.match(s.render().error, /cancellation could not be confirmed/); assert.equal(s.render().dirty, true);
  deny = false; await s.render().close(); assert.equal(s.render().inspector, null);
  s.render().reset(); await flush();
  assert.equal(s.props.source, '# ZZ Draft'); assert.ok(s.calls.some(x => x.body?.action === 'abandon'));
});
test('media dirty ownership stays in Creator across sections and successful new save clears media without changing released context reset', () => {
  const source = readFileSync(new URL('../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
  assert.match(source, /const isDirty = \(conceptImages.guardActive && !isCurrentContentReadOnly && isContentDirty\)/);
  assert.match(source, /conceptImages.reset\(abandonMedia\)/);
  assert.match(source, /conceptImages.usesMedia\s*\? await conceptImages.save\(savePayload\)\s*: await supabase.rpc\(command.rpc, \{\s*p_active_library_id: activeLibraryId,\s*p_expected_version: conceptIdToSave \? conceptRevision.version : null,\s*p_expected_updated_at: conceptIdToSave \? conceptRevision.updatedAt : null,\s*p_body_format: bodyFormatToSave,\s*p_payload: savePayload,\s*\}\)/);
  assert.match(source, /onImage=\{creatorAuthority.canSaveConcept \? position => conceptImages.open\(position\) : undefined\}/);
});

function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (typeof node.type === 'function') return nodes(node.type(node.props));
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node.type === 'function') return text(node.type(node.props));
  return text(node.props?.children);
}
function writeEditor() {
  const hooks = hookHarness();
  const exports = loadConceptModule('components/creator/ConceptImageAuthoring.tsx', { react: hooks.hooks, 'react/jsx-runtime': jsx, '@/lib/concept-media': m, '@/components/ConceptMediaContent': { VerifiedConceptImage() {} }, '@/components/ConceptMedia.module.css': {} });
  return props => hooks.render(() => exports.ConceptImageWriteEditor(props));
}
test('Write editor keeps image order, hides identifiers and dispatches Edit/Replace/Remove to the correct image', () => {
  const s = setup(), editor = writeEditor(), ref = { current: null }, actions = [];
  const other = { ...item, placementId: randomUUID(), assetId: randomUUID(), ordinal: 1, altText: 'Second image' };
  let source = `Before\n\n${m.conceptMediaToken(item.placementId)}\n\nBetween\n\n${m.conceptMediaToken(other.placementId)}\n\nAfter`;
  const controller = { ...s.render(), items: [item, other], open: (...args) => actions.push(['open', ...args]), remove: id => actions.push(['remove', id]) };
  const render = () => editor({ source, controller, disabled: false, className: 'editor', editorRef: ref, onChange: value => { source = value; } });
  const tree = render();
  assert.ok(!text(tree).includes('socrates-media'));
  for (const id of [item.placementId, item.assetId, other.placementId, other.assetId]) assert.ok(!text(tree).includes(id));
  const fields = nodes(tree).filter(n => n.type === 'textarea');
  assert.deepEqual(fields.map(n => n.props.value), ['Before', 'Between', 'After']);
  const entries = nodes(tree).filter(n => n.props?.role === 'group' && n.props['aria-label']?.startsWith('Image'));
  assert.deepEqual(entries.map(n => n.props['aria-label']), ['Image 1: Original alt', 'Image 2: Second image']);
  for (const [label, expected] of [['Edit Image 2 metadata', ['open', 0, other]], ['Replace Image 1', ['open', 0, item, true]], ['Remove Image 2 from Concept draft', ['remove', other.placementId]]]) {
    nodes(tree).find(n => n.props?.['aria-label'] === label).props.onClick();
    assert.deepEqual(actions.at(-1), expected);
  }
  fields[1].props.onChange({ target: { value: '**Edited between**', selectionStart: 8, selectionEnd: 8 } });
  assert.deepEqual(m.conceptMediaBlocks(source).map(b => b.id), [item.placementId, other.placementId]);
  assert.match(source, /Before[\s\S]*\*\*Edited between\*\*[\s\S]*After/);
});
test('Markdown toolbar selection and focus map to prose rather than hidden tokens', () => {
  const s = setup(), editor = writeEditor(), ref = { current: null };
  let source = `Before\n\n${m.conceptMediaToken(item.placementId)}\n\nBetween`;
  const render = () => editor({ source, controller: { ...s.render(), items: [item] }, disabled: false, className: '', editorRef: ref, onChange: value => { source = value; } });
  let tree = render();
  const field = nodes(tree).filter(n => n.type === 'textarea')[1];
  field.props.onSelect({ currentTarget: { selectionStart: 0, selectionEnd: 7 } });
  const range = ref.current.selection();
  assert.equal(source.slice(range.start, range.end), 'Between');
  const edited = applyMarkdownEdit(source, range.start, range.end, 'bold'); source = edited.source;
  tree = render();
  const focused = [], selections = [];
  nodes(tree).filter(n => n.type === 'textarea')[1].props.ref({ focus: () => focused.push(true), setSelectionRange: (...value) => selections.push(value) });
  ref.current.focusSelection(edited.selectionStart, edited.selectionEnd);
  assert.deepEqual(selections, [[2, 9]]); assert.equal(focused.length, 1);
  assert.equal(m.conceptMediaBlocks(source).length, 1);
  assert.equal(nodes(tree).filter(n => n.type === 'textarea')[1].props.value, '**Between**');
});
test('management list stays visible while editing; selected image and unapplied metadata are explicit', async () => {
  const source = m.conceptMediaToken(ids.placement);
  const s = setup({ props: { conceptId, source, baseSource: source } }); await flush();
  s.render().open(0, item); s.render().changeMetadata('alt', 'Pending alt');
  const tree = s.default({ controller: s.render(), disabled: false });
  assert.ok(nodes(tree).some(n => n.props?.['aria-label'] === 'Images in this Concept'));
  assert.match(text(tree), /Editing Image 1/); assert.match(text(tree), /Editing this image/);
  assert.equal(s.render().items[0].altText, 'Original alt');
  assert.equal(s.calls.some(c => c.body?.action === 'save'), false);
  assert.ok(nodes(tree).filter(n => n.type === 'button' && n.props['aria-label']).every(n => n.props.disabled));
});
test('upload processing, inserted unsaved state and save failure never claim a confirmed Concept save', async () => {
  let resolveUpload;
  const s = setup({ respond: ({ init, body }) => init.method === 'PUT' ? new Promise(r => { resolveUpload = r; }) : body?.action === 'save' ? Response.json({ error: 'Uncertain response' }, { status: 503 }) : null });
  s.render().open(0); s.render().changeMetadata('alt', 'Alt');
  const upload = s.render().upload(new Blob(['image'])); await flush();
  assert.match(text(s.default({ controller: s.render(), disabled: false })), /Uploading image…/);
  resolveUpload(Response.json({ assetId: ids.asset, ready: true })); await upload;
  s.render().insert();
  let output = text(s.default({ controller: s.render(), disabled: false }));
  assert.match(output, /Image ready — save the Concept to keep your changes/);
  assert.doesNotMatch(output, /Concept saved/);
  await s.render().save({ p_body_markdown: s.props.source });
  output = text(s.default({ controller: s.render(), disabled: false }));
  assert.doesNotMatch(output, /Concept saved/); assert.equal(s.render().dirty, true);
});
test('mismatched authoritative media readback rejects success and preserves the draft', async () => {
  const s = setup({ respond: ({ body }) => body?.action === 'save' ? Response.json({ concept_id: conceptId, version_id: versionId, bodyMarkdown: body.payload.p_body_markdown, placements: [] }) : null });
  (await uploaded(s)).insert();
  const before = s.props.source;
  const result = await s.render().save({ p_body_markdown: before });
  assert.match(result.error.message, /readback differs/);
  assert.equal(s.props.source, before); assert.equal(s.render().items.length, 1); assert.equal(s.render().dirty, true);
});

function recovery(options = {}) {
  const reservations = [];
  const s = setup({ ...options, respond: async args => {
    const override = await options.respond?.(args); if (override) return override;
    if (args.body?.action === 'reserve' || args.url === '/api/content-media/reservations') {
      const id = randomUUID(); reservations.push(id); return Response.json({ reservationId: id });
    }
    if (args.init.method === 'PUT' && await args.init.body.text() === 'malformed') return Response.json({ error: 'Image rejected' }, { status: 422 });
  } });
  return { ...s, reservations };
}
for (const existing of [false, true]) test(`${existing ? 'existing' : 'new'} Concept reconciles repeated obsolete failures before save without cancelling its complete current manifest`, async () => {
  const source = m.conceptMediaToken(ids.placement);
  const s = recovery({ props: existing ? { conceptId, source, baseSource: source } : {} }); await flush();
  (await uploaded(s)).insert(); const retained = s.render().items.map(p => p.reservationId).filter(Boolean);
  s.render().open(s.props.source.length);
  for (let i = 0; i < 2; i++) await s.render().upload(new Blob(['malformed']));
  assert.equal(s.calls.filter(c => c.method === 'DELETE').length, 0, 'Failure alone never cancels');
  await s.render().upload(new Blob(['valid'])); s.render().changeMetadata('alt', 'Replacement'); s.render().insert();
  const before = s.props.source, manifest = m.conceptMediaFingerprint(s.render().items);
  const result = await s.render().save({ p_body_markdown: before }); assert.equal(result.error, null);
  const saveAt = s.calls.findIndex(c => c.body?.action === 'save');
  const deleted = s.calls.slice(0, saveAt).filter(c => c.method === 'DELETE').map(c => c.url.split('/').at(-1));
  assert.deepEqual(deleted, s.reservations.slice(1, 3));
  assert.ok(retained.every(id => !deleted.includes(id))); assert.ok(!deleted.includes(s.reservations.at(-1)));
  assert.equal(s.props.source, before); assert.equal(m.conceptMediaFingerprint(result.data.placements), manifest);
});
test('Remove reconciles an unused successful upload while preserving another image; Cancel confirms only unused reservations', async () => {
  const s = recovery(); (await uploaded(s)).insert(); const first = s.render().items[0];
  (await uploaded(s)).insert(); const second = s.render().items.find(p => p.placementId !== first.placementId); s.render().remove(second.placementId);
  assert.equal(s.calls.filter(c => c.method === 'DELETE').length, 0);
  await s.render().save({ p_body_markdown: s.props.source });
  assert.deepEqual(s.calls.filter(c => c.method === 'DELETE').map(c => c.url.split('/').at(-1)), [second.reservationId]);
  assert.equal(s.render().items[0].reservationId, first.reservationId);
  s.render().open(0); await s.render().upload(new Blob(['malformed'])); await s.render().close();
  assert.equal(s.render().inspector, null); assert.equal(s.render().items[0].reservationId, first.reservationId);
  assert.equal(s.calls.filter(c => c.method === 'DELETE').at(-1).url.split('/').at(-1), s.reservations.at(-1));
});
for (const failure of ['rejected', 'lost', 'timeout', 'unconfirmed']) test(`Concept ${failure} cancellation blocks content save, preserves draft and retries the same reservation`, async () => {
  let deny = true;
  const s = recovery({ respond: ({ init }) => {
    if (init.method !== 'DELETE' || !deny) return;
    assert.ok(init.signal instanceof AbortSignal);
    if (failure === 'lost' || failure === 'timeout') throw new Error(failure);
    return failure === 'rejected' ? Response.json({ error: 'Unavailable' }, { status: 503 }) : Response.json({});
  } });
  s.render().open(0); await s.render().upload(new Blob(['malformed']));
  await s.render().upload(new Blob(['valid'])); s.render().changeMetadata('alt', 'Keep'); s.render().insert();
  const before = s.props.source, manifest = m.conceptMediaFingerprint(s.render().items);
  const result = await s.render().save({ p_body_markdown: before });
  assert.match(result.error.message, /Retry Save or Cancel/); assert.equal(s.calls.filter(c => c.body?.action === 'save').length, 0);
  assert.equal(s.props.source, before); assert.equal(m.conceptMediaFingerprint(s.render().items), manifest); assert.equal(s.render().dirty, true);
  deny = false; assert.equal((await s.render().save({ p_body_markdown: before })).error, null);
  assert.equal(s.calls.filter(c => c.body?.action === 'save').length, 1);
  assert.deepEqual(s.calls.filter(c => c.method === 'DELETE').map(c => c.url.split('/').at(-1)), [s.reservations[0], s.reservations[0]]);
});
test('Concept reconciliation blocks duplicate Save and fences a changed Library before any content write', async () => {
  let resolve;
  const s = recovery({ respond: ({ init }) => init.method === 'DELETE' ? new Promise(r => { resolve = r; }) : null });
  s.render().open(0); await s.render().upload(new Blob(['malformed'])); await s.render().upload(new Blob(['valid']));
  s.render().changeMetadata('alt', 'Keep'); s.render().insert();
  const pending = s.render().save({ p_body_markdown: s.props.source }); await flush();
  assert.ok((await s.render().save({ p_body_markdown: s.props.source })).error);
  const itemId = s.render().items[0].placementId; s.render().remove(itemId); assert.equal(s.render().items.length, 1);
  s.props.libraryId = ids.asset; s.render(); s.hooks.effects(); resolve(Response.json({ cancelled: true }));
  assert.match((await pending).error.message, /context changed/);
  assert.equal(s.calls.filter(c => c.body?.action === 'save').length, 0); assert.equal(s.render().context, null);
});
