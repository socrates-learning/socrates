import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mountVisualField } from './fixtures/creator-role-workspaces.mjs';
const tools = [['Bold', 'strong'], ['Italic', 'em'], ['Heading', 'h2'], ['Bulleted List', 'ul'], ['Numbered List', 'ol'], ['Link', 'a'], ['Quote', 'blockquote']];

for (const label of ['Question', 'Answer']) for (const [tool, selector] of tools) {
  test(`${label} ${tool}: actual visual control formats selected text, empty input, multiline and Unicode without saving`, async () => {
    for (const value of ['Selected', '', 'A\n\nB', '前 🧠 café 後']) {
      const h = await mountVisualField({ label, wrapper: true, value });
      try {
        assert.equal(h.writes.length, 0, 'mount is not conversion');
        if (!value) await h.type('Selected');
        await h.select(1, h.view.state.doc.content.size - 1);
        await h.click(tool);
        if (tool === 'Link') {
          await h.input(h.dom.window.document.querySelector('input[type=url]'), 'https://example.test/path');
          await h.click('Apply Link');
        }
        assert.ok(h.view.dom.querySelector(selector), `${tool}: ${h.view.dom.innerHTML}`);
        assert.ok(h.view.dom.textContent.includes(value.replace(/\n/g, '') || 'Selected'));
        assert.equal(h.props.mode, 'write');
        assert.equal(h.props.format, 'visual_markdown_v1');
        assert.equal(h.handle.current.capture().source, h.props.value);
        assert.ok(h.writes.length > 0);
        assert.equal(h.dom.window.document.activeElement, h.view.dom, 'formatting restores editor focus');
      } finally { await h.close(); }
    }
  });
}

test('native independent controls preserve labels; mode switches retain source; oversized unsupported source stays visible', async () => {
  const h = await mountVisualField({ wrapper: true });
  try {
    assert.deepEqual([...h.dom.window.document.querySelectorAll('button')].map(b => b.textContent), [...tools.map(t => t[0]), 'Write', 'Preview', 'Source']);
    assert.ok([...h.dom.window.document.querySelectorAll('button')].every(b => b.type === 'button'));
    assert.equal(h.dom.window.document.querySelector('label').htmlFor, h.view.dom.id);
    await h.click('Preview'); assert.equal(h.writes.length, 0); assert.equal(h.props.mode, 'preview');
    assert.equal(h.dom.window.document.querySelector('[aria-label="Question preview"]').textContent, 'Selected');
    await h.click('Write'); assert.equal(h.writes.length, 0);
    await h.update({ value: 'x'.repeat(70000), format: 'legacy', documentKey: 'oversized' });
    assert.equal(h.props.mode, 'source');
    assert.equal(h.dom.window.document.querySelector('textarea').value.length, 70000);
    assert.equal(h.writes.length, 0, 'size bound never truncates source');
  } finally { await h.close(); }
});
test('selection and Undo survive Preview and internal unmount; repeated formatting combines marks', async () => {
  const h = await mountVisualField({ wrapper: true, format: 'legacy' });
  try {
    await h.select(2, 5); await h.click('Bold'); await h.click('Italic');
    assert.equal(h.view.dom.querySelector('strong em, em strong').textContent, 'ele');
    const before = { source: h.props.value, format: h.props.format, from: h.view.state.selection.from, to: h.view.state.selection.to };
    await h.click('Preview'); await h.click('Write'); await h.show(false); await h.show(true);
    assert.deepEqual({ source: h.props.value, format: h.props.format, from: h.view.state.selection.from, to: h.view.state.selection.to }, before);
    await h.act(() => { h.session.undo(); h.view.updateState(h.session.state); h.session.undo(); h.view.updateState(h.session.state); });
    assert.deepEqual(JSON.parse(JSON.stringify(h.handle.current.capture())), { source: 'Selected', format: 'legacy' });
  } finally { await h.close(); }
});
test('disabled/read-only fields reject typing and commands; wrapper owns no save, media or routing', async () => {
  for (const locked of [{ disabled: true }, { readOnly: true }]) {
    const h = await mountVisualField({ wrapper: true, ...locked });
    try {
      for (const [tool] of tools) { assert.equal(h.button(tool).disabled, true); await h.click(tool); }
      await h.type('bypass'); assert.equal(h.props.value, 'Selected'); assert.equal(h.writes.length, 0);
      await h.update({ mode: 'source' });
      await h.input(h.dom.window.document.querySelector('textarea'), 'bypass source');
      assert.equal(h.props.value, 'Selected'); assert.equal(h.writes.length, 0);
    } finally { await h.close(); }
  }
  const source = readFileSync(new URL('../components/creator/QuestionMarkdownField.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /supabase|fetch\(|useRouter|onSave|dangerouslySetInnerHTML|QuestionImageAuthoring/);
});
