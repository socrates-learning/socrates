import assert from 'node:assert/strict';
import test from 'node:test';
import { session, markdown, pm, positions, textNodes, token, mediaA, mediaB } from './fixtures/official-authoring.mjs';

for (const [command, mark] of [['bold', 'strong'], ['italic', 'em']]) {
  test(`${command}: selection toggle and collapsed typing use actual framework marks`, () => {
    const editor = session('abcd'); editor.select(4, 2);
    assert.equal(editor.format(command), true); assert.equal(editor.state.selection.anchor, 4); assert.equal(editor.state.selection.head, 2);
    assert.deepEqual(textNodes(editor.state.doc).map(n => [n.text, n.marks]), [['a', []], ['bc', [mark]], ['d', []]]);
    editor.format(command); assert.equal(editor.state.doc.textContent, 'abcd'); assert.ok(textNodes(editor.state.doc).every(n => !n.marks.length));
    editor.select(5); const unchanged = editor.source; editor.format(command); assert.equal(editor.source, unchanged);
    editor.insertText('X'); assert.deepEqual(textNodes(editor.state.doc).at(-1).marks, [mark]);
  });
}

test('combined typing marks remove one mark without losing the other', () => {
  const editor = session(''); editor.format('bold'); editor.format('italic'); editor.insertText('A');
  assert.deepEqual(textNodes(editor.state.doc)[0].marks, ['strong', 'em']);
  editor.format('bold'); editor.insertText('B');
  assert.deepEqual(textNodes(editor.state.doc).at(-1).marks, ['em']);
  const loaded = markdown.parseOfficialSource(editor.source, 'question', 'visual_markdown_v1'); assert.equal(loaded.mode, 'visual');
  assert.equal(markdown.sameDocumentContent(editor.state.doc, loaded.doc), true);
});

test('Heading apply/remove does not touch another paragraph', () => {
  const editor = session('First\n\nSecond'); editor.select(2); editor.format('heading');
  assert.equal(editor.state.doc.firstChild.type.name, 'heading'); assert.equal(editor.source, '## First\n\nSecond');
  editor.format('heading'); assert.equal(editor.state.doc.firstChild.type.name, 'paragraph'); assert.equal(editor.source, 'First\n\nSecond');
});

for (const [command, type] of [['bulleted-list', 'bullet_list'], ['numbered-list', 'ordered_list']]) {
  test(`${command}: apply, Enter continuation, empty exit and remove`, () => {
    const editor = session('One'); editor.select(4); assert.equal(editor.format(command), true);
    assert.equal(editor.state.doc.firstChild.type.name, type);
    assert.equal(editor.enter(), true); assert.equal(editor.state.doc.firstChild.childCount, 2);
    editor.insertText('Two'); const reloaded = markdown.parseOfficialSource(editor.source, 'question', 'visual_markdown_v1'); assert.equal(reloaded.mode, 'visual', editor.source);
    assert.equal(editor.enter(), true); assert.equal(editor.enter(), true);
    assert.equal(editor.state.doc.lastChild.type.name, 'paragraph'); assert.equal(editor.state.doc.firstChild.childCount, 2);
    const at = positions(editor.state.doc, 'One')[0]; editor.select(at); assert.equal(editor.format(command), true);
    assert.equal(editor.state.doc.firstChild.type.name, 'paragraph');
  });

  for (const reverse of [false, true]) {
    test(`${command}: multiple marked paragraphs preserve order and ${reverse ? 'reverse' : 'forward'} selection`, () => {
      const source = 'Before\n\n**Bold 日本**\n\n*Italic café*\n\n[Link 😀](https://example.test/a)\n\nAfter';
      const editor = session(source);
      const from = positions(editor.state.doc, 'Bold')[0] + 1;
      const to = positions(editor.state.doc, 'Link')[0] + 'Link 😀'.length - 1;
      editor.select(reverse ? to : from, reverse ? from : to);
      const preceding = editor.state.doc;
      const selection = editor.state.selection.toJSON();
      const selectedText = editor.copy().text;
      assert.equal(editor.format(command), true);
      const list = editor.state.doc.child(1);
      assert.equal(list.type.name, type); assert.equal(list.childCount, 3);
      for (let i = 0; i < 3; i++) {
        assert.equal(list.child(i).childCount, 1);
        assert.ok(list.child(i).firstChild.eq(preceding.child(i + 1)), 'paragraph text and complete inline marks remain exact');
      }
      assert.ok(editor.state.doc.firstChild.eq(preceding.firstChild));
      assert.ok(editor.state.doc.lastChild.eq(preceding.lastChild));
      assert.equal(editor.copy().text, selectedText);
      assert.equal(editor.state.selection.anchor > editor.state.selection.head, reverse);
      assert.equal(editor.state.selection.from, from + 2);
      assert.equal(editor.state.selection.to, to + 6);
      const transformed = editor.state.doc;
      const transformedSource = editor.source;
      const transformedSelection = editor.state.selection.toJSON();
      assert.equal(markdown.sameDocumentContent(transformed, markdown.parseOfficialSource(transformedSource, 'question', 'visual_markdown_v1').doc), true);
      assert.equal(editor.undo(), true); assert.ok(editor.state.doc.eq(preceding));
      assert.equal(editor.source, source); assert.deepEqual(editor.state.selection.toJSON(), selection);
      assert.equal(editor.redo(), true); assert.ok(editor.state.doc.eq(transformed));
      assert.equal(editor.source, transformedSource); assert.deepEqual(editor.state.selection.toJSON(), transformedSelection);
      assert.equal(editor.format(command), true);
      assert.equal(markdown.sameDocumentContent(editor.state.doc, preceding), true);
      assert.equal(editor.source, source);
    });
  }

  test(`${command}: two paragraphs support continuation and empty-item exit`, () => {
    const editor = session('One\n\nTwo'); editor.select(1, 9);
    assert.equal(editor.format(command), true); assert.equal(editor.state.doc.firstChild.childCount, 2);
    editor.select(positions(editor.state.doc, 'Two')[0] + 3);
    assert.equal(editor.enter(), true); assert.equal(editor.state.doc.firstChild.childCount, 3);
    assert.equal(editor.insertText('三 😀'), true);
    assert.equal(editor.enter(), true); assert.equal(editor.enter(), true);
    assert.equal(editor.state.doc.firstChild.childCount, 3);
    assert.equal(editor.state.doc.lastChild.type.name, 'paragraph');
    assert.equal(editor.state.doc.firstChild.lastChild.textContent, '三 😀');
  });

  test(`${command}: removing middle items preserves the surrounding flat lists and selection`, () => {
    const editor = session('Before\n\nOne\n\nTwo\n\nAfter');
    editor.select(1, editor.state.doc.content.size - 1); assert.equal(editor.format(command), true);
    const before = editor.state.doc; const source = editor.source;
    editor.select(positions(before, 'Two')[0] + 2, positions(before, 'One')[0] + 1);
    const selected = editor.copy().text;
    assert.equal(editor.format(command), true);
    assert.deepEqual(Array.from({ length: editor.state.doc.childCount }, (_, i) => editor.state.doc.child(i).type.name), [type, 'paragraph', 'paragraph', type]);
    assert.equal(editor.state.doc.firstChild.textContent, 'Before'); assert.equal(editor.state.doc.lastChild.textContent, 'After');
    assert.equal(editor.copy().text, selected); assert.ok(editor.state.selection.anchor > editor.state.selection.head);
    assert.ok(editor.state.doc.child(1).eq(before.firstChild.child(1).firstChild));
    assert.ok(editor.state.doc.child(2).eq(before.firstChild.child(2).firstChild));
    const removed = editor.source;
    assert.equal(editor.undo(), true); assert.ok(editor.state.doc.eq(before)); assert.equal(editor.source, source);
    assert.equal(editor.redo(), true); assert.equal(editor.source, removed);
  });

  test(`${command}: native Select All uses valid text endpoints and toggles the complete flat list`, () => {
    const source = 'One\r\n\r\nTwo\r\n';
    const editor = session(source);
    const selectAll = () => editor.apply(editor.state.tr.setSelection(new (pm('prosemirror-state').AllSelection)(editor.state.doc)));
    selectAll(); assert.equal(editor.format(command), true);
    assert.equal(editor.state.doc.firstChild.childCount, 2);
    assert.ok(editor.state.selection.$anchor.parent.inlineContent);
    assert.ok(editor.state.selection.$head.parent.inlineContent);
    assert.equal(editor.copy().text, 'One\nTwo');
    const transformed = editor.source;
    assert.equal(editor.undo(), true); assert.equal(editor.source, source);
    assert.equal(editor.redo(), true); assert.equal(editor.source, transformed);
    selectAll(); assert.equal(editor.format(command), true); assert.equal(editor.source, source);
    assert.equal(editor.state.doc.childCount, 2);
    assert.equal(editor.copy().text, 'One\nTwo');
    const image = session(token(mediaA), 'concept', 'legacy');
    image.apply(image.state.tr.setSelection(new (pm('prosemirror-state').AllSelection)(image.state.doc)));
    assert.equal(image.format(command), false); assert.equal(image.source, token(mediaA));
    assert.equal(image.formatMarker, 'legacy'); assert.equal(image.undo(), false);
  });

  for (const format of ['legacy', 'visual_markdown_v1']) {
    test(`${command}: multi-paragraph ${format} edit converts only on change and Undo restores exact source`, () => {
      const source = 'First  \r\n\r\nSecond\r\n';
      const editor = session(source, 'concept', format);
      editor.select(1, editor.state.doc.content.size - 1);
      const preceding = editor.state.doc;
      editor.setMode('preview'); assert.equal(editor.format(command), false);
      assert.equal(editor.source, source); assert.equal(editor.formatMarker, format);
      editor.setMode('visual'); assert.equal(editor.format(command), true);
      assert.equal(editor.formatMarker, 'visual_markdown_v1');
      const transformed = editor.source;
      editor.setMode('source'); assert.equal(editor.captureSource(), transformed); editor.setMode('visual');
      assert.equal(editor.undo(), true); assert.ok(editor.state.doc.eq(preceding));
      assert.equal(editor.source, source); assert.equal(editor.formatMarker, format);
      assert.equal(editor.redo(), true); assert.equal(editor.source, transformed);
      assert.equal(editor.formatMarker, 'visual_markdown_v1');
    });
  }

  test(`${command}: unsupported mixed/image or quoted ranges leave document, source, format and history unchanged`, () => {
    for (const [source, format] of [[`First\n\n${token(mediaA)}\n\nSecond`, 'legacy'], ['> First\n>\n> Second', 'visual_markdown_v1']]) {
      const editor = session(source, 'concept', format);
      editor.select(positions(editor.state.doc, 'First')[0], positions(editor.state.doc, 'Second')[0] + 6);
      const preceding = editor.state.doc;
      const selection = editor.state.selection.toJSON();
      assert.equal(editor.format(command), false); assert.ok(editor.state.doc.eq(preceding));
      assert.equal(editor.source, source); assert.equal(editor.formatMarker, format);
      assert.deepEqual(editor.state.selection.toJSON(), selection); assert.equal(editor.undo(), false);
    }
  });
}

test('Quote applies/removes and continues/exits without a second document model', () => {
  const editor = session('Quote'); editor.select(6); editor.format('quote');
  assert.equal(editor.state.doc.firstChild.type.name, 'blockquote');
  editor.enter(); editor.insertText('Next'); assert.equal(editor.state.doc.firstChild.childCount, 2);
  editor.enter(); editor.enter(); assert.equal(editor.state.doc.lastChild.type.name, 'paragraph');
  editor.select(positions(editor.state.doc, 'Quote')[0]); editor.format('quote'); assert.equal(editor.state.doc.firstChild.type.name, 'paragraph');
});

test('Link insert/edit/remove rejects unsafe input and preserves selection', () => {
  const editor = session('before after'); editor.select(8, 13);
  assert.equal(editor.link('https://example.test/a_(b)'), true);
  editor.select(10); assert.equal(editor.link('https://example.test/updated'), true);
  assert.match(editor.source, /updated/); assert.equal(editor.state.doc.textContent, 'before after');
  const before = editor.source;
  for (const href of ['javascript:alert(1)', 'data:text/html,x', '//example.test']) { assert.equal(editor.link(href), false); assert.equal(editor.source, before); }
  assert.equal(editor.removeLink(), true); assert.equal(editor.source, 'before after');
  editor.select(13); assert.equal(editor.link('https://example.test', 'new link'), true); assert.equal(editor.state.doc.textContent, 'before afternew link');
});

test('undo/redo restores original spelling, direction, split/join source and mode round trips', () => {
  const source = 'First\r\n\r\n7. Second\r\n19. Third\r\n';
  const editor = session(source); editor.select(4, 2); editor.format('bold'); const formatted = editor.source;
  editor.setMode('preview'); editor.setMode('source'); editor.setMode('visual');
  assert.equal(editor.undo(), true); assert.equal(editor.source, source);
  assert.equal(editor.state.selection.anchor, 4); assert.equal(editor.state.selection.head, 2);
  assert.equal(editor.redo(), true); assert.equal(editor.source, formatted);
  editor.select(3); editor.enter(); const split = editor.source; assert.notEqual(split, formatted);
  editor.undo(); assert.equal(editor.source, formatted); editor.redo(); assert.equal(editor.source, split);
});

test('external paste stays text; supported internal paste preserves prose marks only', () => {
  const a = session(''); a.paste('1. literal\n\n**not markup**');
  assert.equal(a.state.doc.firstChild.type.name, 'paragraph'); assert.equal(a.state.doc.lastChild.textContent, '**not markup**');
  a.select(1, 4); a.format('bold'); const copied = a.copy();
  const b = session(''); assert.equal(b.paste(copied.text, copied.internal), true);
  assert.ok(textNodes(b.state.doc).some(n => n.marks.includes('strong')));
  const previous = b.source; assert.equal(b.paste('x', JSON.stringify({ version: 1, slice: { content: [{ type: 'image', attrs: { src: 'https://x' } }] } })), false); assert.equal(b.source, previous);
});

test('text transactions cannot remove, duplicate, corrupt or reorder image identities', () => {
  const editor = session(`Before\n\n${token(mediaA)}\n\nMiddle\n\n${token(mediaB)}\n\nAfter`, 'concept');
  const initial = editor.source; const doc = editor.state.doc; const images = [];
  doc.forEach((node, pos) => { if (node.type.name === 'concept_media') images.push({ node, pos }); });
  const attempts = [
    () => editor.state.tr.delete(images[0].pos, images[0].pos + 1),
    () => editor.state.tr.insert(images[0].pos, images[0].node),
    () => editor.state.tr.setNodeMarkup(images[0].pos, undefined, { placementId: mediaB }),
    () => editor.state.tr.replaceWith(0, doc.content.size, [doc.child(0), images[1].node, doc.child(2), images[0].node, doc.child(4)]),
    () => editor.state.tr.setSelection(new (pm('prosemirror-state').AllSelection)(doc)).deleteSelection(),
  ];
  for (const attempt of attempts) { assert.equal(editor.apply(attempt()), false); assert.equal(editor.source, initial); }
  editor.select(1, doc.content.size - 1); assert.equal(editor.copy().internal, null);
});

test('stale transactions, forged provenance and oversized input leave the current session intact', () => {
  const editor = session('abc'); const stale = editor.state.tr.insertText('X'); editor.insertText('Y'); const source = editor.source;
  assert.equal(editor.apply(stale), false); assert.equal(editor.source, source);
  assert.equal(editor.apply(editor.state.tr.setDocAttribute('provenance', { source: 'forged' })), false); assert.equal(editor.source, source);
  assert.equal(editor.paste('x'.repeat(65537)), false); assert.equal(editor.source, source);
});

test('composition may update text but blocks premature capture and unrelated toolbar operations', () => {
  const editor = session(''); editor.composing = true;
  editor.insertText('日'); assert.equal(editor.format('bold'), false); assert.equal(editor.setMode('preview'), false);
  assert.throws(() => editor.captureSource(), /composition/);
  editor.composing = false; editor.insertText('本'); assert.equal(editor.captureSource(), '日本');
});

test('Source edits retain their current interpretation and unsupported source remains recoverable', () => {
  const editor = session('**literal**', 'question', 'legacy');
  editor.setMode('source'); assert.equal(editor.replaceSource('_also literal_'), true);
  assert.equal(editor.formatMarker, 'legacy'); assert.equal(editor.state.doc.textContent, '_also literal_');
  editor.setMode('visual'); editor.select(2, 6); editor.format('bold');
  assert.equal(editor.formatMarker, 'visual_markdown_v1'); editor.undo();
  assert.deepEqual(JSON.parse(JSON.stringify(editor.captureSurface())), { source: '_also literal_', format: 'legacy' });
  const fallback = session('`unsupported`'); assert.equal(fallback.mode, 'source');
  assert.equal(fallback.replaceSource('**supported**'), true); assert.equal(fallback.mode, 'source');
  assert.equal(fallback.setMode('visual'), true); assert.equal(fallback.state.doc.textContent, 'supported');
  fallback.setMode('source'); fallback.replaceSource('[bad](javascript:x)');
  assert.equal(fallback.state, null); assert.equal(fallback.setMode('visual'), false);
  assert.equal(fallback.captureSource(), '[bad](javascript:x)'); assert.equal(fallback.formatMarker, 'visual_markdown_v1');
});

test('Source mode cannot remove or substitute protected Concept image identities', () => {
  for (const newline of ['\n', '\r\n']) {
    const source = `Before\n\n${token(mediaA)}\n\nAfter`;
    const original = source.replace(/\n/g, newline);
    const editor = session(original, 'concept', 'legacy'); editor.setMode('source');
    assert.equal(editor.replaceSource('Before\n\nAfter'), false);
    assert.equal(editor.replaceSource(original.replace(mediaA, mediaB)), false);
    assert.equal(editor.source, original); assert.equal(editor.formatMarker, 'legacy');
    assert.equal(editor.replaceSource(original.replace('After', 'Revised')), true);
    assert.equal(editor.formatMarker, 'legacy');
  }
});
