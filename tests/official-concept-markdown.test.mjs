import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { mountVisualField, editor, nodes } from './fixtures/creator-role-workspaces.mjs';
import { token, mediaA } from './fixtures/official-authoring.mjs';
const plain = value => JSON.parse(JSON.stringify(value));

test('loaded legacy Concept opens, focuses and previews without changing source or interpretation', async () => {
  const source = '**Known** and plain', h = await mountVisualField({ flavor: 'concept', label: 'Concept', ariaLabel: 'Concept or explanation', value: source, format: 'legacy' });
  try {
    assert.equal(h.view.dom.querySelector('strong').textContent, 'Known');
    await h.select(1, 3); h.view.focus(); await h.click('Preview'); await h.click('Write');
    assert.deepEqual(plain(h.handle.current.capture()), { source, format: 'legacy' }); assert.equal(h.writes.length, 0);
    await h.select(11, 16); await h.click('Italic');
    assert.equal(h.props.format, 'visual_markdown_v1'); assert.equal(h.view.dom.querySelector('strong').textContent, 'Known');
    await h.act(() => { h.session.undo(); h.view.updateState(h.session.state); });
    assert.deepEqual(plain(h.handle.current.capture()), { source, format: 'legacy' });
  } finally { await h.close(); }
});
test('Concept Source fallback is visible, preserves literal source and cannot remove protected image tokens', async () => {
  const source = `Before\n\n${token(mediaA)}\n\nAfter`, h = await mountVisualField({ flavor: 'concept', label: 'Concept', value: source, renderMedia: () => React.createElement('span', null, 'Private image preview') });
  try {
    assert.ok(h.view.dom.textContent.includes('Private image preview'));
    assert.doesNotMatch(h.view.dom.innerHTML, new RegExp(mediaA));
    await h.click('Source');
    const field = h.dom.window.document.querySelector('textarea'); assert.equal(field.value, source);
    await h.input(field, 'Before\n\nAfter');
    assert.equal(h.props.value, source); assert.equal(h.writes.length, 0); assert.match(h.dom.window.document.querySelector('[role=status]').textContent, /image/i);
    await h.input(field, source.replace('Before', 'Updated'));
    assert.ok(h.props.value.startsWith('Updated')); await h.click('Write');
    assert.ok(h.view.dom.textContent.includes('Updated')); assert.ok(h.view.dom.textContent.includes('Private image preview'));
  } finally { await h.close(); }
});
test('external image insertion replaces only the controlled document and retains its interpretation', async () => {
  const h = await mountVisualField({ flavor: 'concept', value: 'Before', format: 'legacy', renderMedia: () => React.createElement('span', null, 'Image') });
  try {
    await h.select(3); assert.equal(h.handle.current.selection(), 6, 'block-boundary placement');
    await h.update({ value: `Before\n\n${token(mediaA)}` });
    assert.ok(h.view.dom.textContent.includes('Image')); assert.equal(h.props.format, 'legacy'); assert.equal(h.writes.length, 0, 'image controller owns its own source write');
  } finally { await h.close(); }
});
test('new official Concept save carries source and format in the prerequisite-aware revision transaction', async () => {
  const h = editor(); let e = h.render();
  const field = nodes(e.tree).find(n => n.type === 'textarea' && n.props['aria-label'] === 'Concept or explanation');
  field.props.onChange({ target: { value: '## Heading\n\n**Bold** and *italic*' } });
  await h.render().saveCurrentConcept(); e = h.render();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].name, 'save_concept_with_format');
  const command = h.calls[0].payload;
  assert.equal(command.p_body_format, 'visual_markdown_v1'); assert.equal(command.p_expected_version, null); assert.equal(command.p_expected_updated_at, null);
  assert.equal(command.p_payload.p_body_markdown, '## Heading\n\n**Bold** and *italic*');
  assert.equal(e.concept, ''); assert.equal(e.isContentDirty, false); assert.deepEqual([...e.selectedTopicIds], ['topic']);
});
test('format readback mismatch never clears a Concept draft or declares success', async () => {
  const h = editor({ response: () => ({ data: { concept_id: 'id', version_id: 'version', updated_at: 'now', bodyMarkdown: 'Draft', body_format: 'legacy', references: [] }, error: null }) });
  h.render().setConcept('Draft'); await h.render().saveCurrentConcept();
  assert.equal(h.render().concept, 'Draft'); assert.equal(h.render().isContentDirty, true); assert.equal(h.render().status.tone, 'error');
});
