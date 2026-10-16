import assert from 'node:assert/strict';
import test from 'node:test';
import { model, render, mountPersonalField } from './fixtures/personal-card-authoring.mjs';
import { pm } from './fixtures/official-authoring.mjs';

const { PersonalCardSession, personalCardDocument, serializePersonalCard } = model;
function select(session, from, to = from) {
  assert.equal(session.apply(session.state.tr.setSelection(pm('prosemirror-state').TextSelection.create(session.state.doc, from, to))), true);
}
for (const source of ['', 'Literal * unmatched <img src=x>', '**Bold** and *italic* and ***both***', '## Heading\n\n- One\n- Two', '1. First\n2. Second', '> Quoted\n> second line', '[Label](https://example.test/path(a))', '\\*literal\\*\nline', 'Text with **nested *italic* bold**']) {
  test('personal Card reader round-trip: ' + JSON.stringify(source), () => {
    const session = new PersonalCardSession(source, 20000);
    assert.equal(session.source, source, 'opening must preserve bytes');
    assert.equal(render(serializePersonalCard(session.state.doc)), render(source));
  });
}
for (const [command, tag] of [['bold', 'strong'], ['italic', 'em'], ['heading', 'h2'], ['bulleted-list', 'ul'], ['numbered-list', 'ol'], ['quote', 'blockquote']]) {
  test(`${command} uses the existing Card grammar and undoes without converting stored text`, () => {
    const s = new PersonalCardSession('Selected', 10000); select(s, 1, 9);
    assert.equal(s.command(command), true); assert.equal(s.error, '');
    assert.ok(render(s.source).includes(`<${tag}>`), s.source);
    s.command('undo'); assert.equal(s.source, 'Selected');
    s.command('redo'); assert.ok(render(s.source).includes(`<${tag}>`));
  });
}
test('Enter keeps blank editing positions and commits the second paragraph through the old reader', () => {
  const s = new PersonalCardSession('First', 10000); select(s, 6);
  pm('prosemirror-commands').splitBlock(s.state, tr => s.apply(tr));
  assert.equal(s.error, ''); assert.equal(s.state.doc.childCount, 2);
  assert.equal(s.apply(s.state.tr.insertText('Second')), true);
  assert.match(render(s.source), /<p>First<\/p><p>Second<\/p>/);
});
test('safe links are formatting; unsafe links and oversized or stale transactions cannot change the draft', () => {
  const s = new PersonalCardSession('Selected', 20); select(s, 1, 9);
  assert.throws(() => s.state.schema.marks.link.create({href:'javascript:alert(1)'}), /Unsafe link/);
  assert.equal(s.source, 'Selected');
  assert.equal(s.apply(s.state.tr.insertText('x'.repeat(21))), false);
  assert.equal(s.source, 'Selected');
  const stale = s.state.tr.insertText('Stale');
  assert.equal(s.apply(s.state.tr.insertText('New')), true);
  assert.equal(s.apply(stale), false); assert.equal(s.source, 'New');
  assert.throws(() => personalCardDocument('> ## Heading inside quote'));
});
test('mounted editor has seven tools, Write/Preview/Source, compatible editing, Undo/Redo and safe links', async () => {
  const h = await mountPersonalField();
  try {
    assert.ok(h.view); assert.equal(h.writes.length, 0);
    for (const name of ['Bold', 'Italic', 'Heading', 'Bulleted List', 'Numbered List', 'Quote', 'Link']) assert.ok(h.button(name));
    await h.select(1, 9); await h.click('Bold'); assert.equal(h.props.value, '**Selected**');
    await h.click('Undo'); assert.equal(h.props.value, 'Selected');
    await h.click('Redo'); assert.equal(h.props.value, '**Selected**');
    await h.click('Preview'); assert.equal(h.dom.window.document.querySelector('[aria-label="Front preview"] strong').textContent, 'Selected');
    await h.click('Source'); const area = h.dom.window.document.querySelector('textarea');
    await h.input(area, '[Visible](https://example.test)');
    await h.click('Write'); assert.equal(h.view.dom.querySelector('a').textContent, 'Visible');
    await h.update({ disabled: true }); await h.type('blocked'); assert.equal(h.props.value, '[Visible](https://example.test)');
    assert.equal(h.view.dom.getAttribute('contenteditable'), 'false');
  } finally { await h.close(); }
});
test('mounted legacy Card stays literal; edits, Preview and Undo preserve punctuation and references', async () => {
  const h = await mountPersonalField({literal: true, value: '**literal** <script>alert(1)</script>'});
  try {
    assert.equal(h.writes.length, 0); assert.equal(h.view, undefined);
    await h.click('Preview'); assert.equal(h.dom.window.document.querySelector('[aria-label="Front preview"]').textContent, h.props.value);
    assert.equal(h.dom.window.document.querySelector('strong,script')?.tagName, 'STRONG'); // Label only; no rendered script.
    assert.equal(h.dom.window.document.querySelector('[aria-label="Front preview"] strong'), null);
    await h.click('Write'); await h.input(h.dom.window.document.querySelector('textarea'), 'Changed');
    assert.equal(h.props.value, 'Changed'); await h.click('Undo'); assert.equal(h.props.value, '**literal** <script>alert(1)</script>');
  } finally { await h.close(); }
});
