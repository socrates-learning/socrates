import assert from 'node:assert/strict';
import test from 'node:test';
import { markdown, session, sessions, positions, token, mediaA, currentRenderer, contentFormat, json } from './fixtures/official-authoring.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const supported = [
  '', 'Plain text', '  Original  spaces  \r\n\r\nSecond paragraph\r\n',
  '**bold**', '*italic*', '***both***', '**bold and *italic***', '*italic and **bold***',
  '## Heading\n\n### Smaller\n\nParagraph', '- One\n- Two', '7. First\n12. Second',
  '> First\n> Second\n>\n> Last', '[**Safe**](https://example.test/path_(one)?x=1&y=2)',
  '\\*literal\\* and \\[brackets\\]', '雪 👩🏽‍⚕️ e\u0301', 'one\ntwo',
];

test('supported v1 source loads without any reserialization', () => {
  for (const flavor of ['concept', 'question']) for (const source of supported) {
    const result = markdown.parseOfficialSource(source, flavor, 'visual_markdown_v1');
    assert.equal(result.mode, 'visual', `${flavor}: ${source}: ${result.reason}`);
    assert.equal(result.source, source); assert.equal(markdown.sourceOf(result.doc), source);
    const editor = session(source, flavor);
    for (const mode of ['preview', 'source', 'visual']) { assert.equal(editor.setMode(mode), true); assert.equal(editor.source, source); }
    editor.select(1); assert.equal(editor.source, source);
  }
});

test('malformed, unsupported, ambiguous and oversized source has a lossless fallback', () => {
  for (const source of ['**unclosed', '[bad](javascript:alert(1))', '[bad](https://example.test', '![image](https://example.test/x)', '<img src=x onerror=x>', '`code`', '~~strike~~', '# Heading', '#### Heading', '+ list', '- A\n  - B', '> > nested', '| a | b |', 'x'.repeat(65537), '[[socrates-media:broken]]']) {
    const result = markdown.parseOfficialSource(source, 'concept', 'visual_markdown_v1');
    assert.equal(result.mode, 'source', source.slice(0, 80)); assert.equal(result.source, source); assert.ok(result.reason);
    const editor = session(source, 'concept'); assert.equal(editor.state, null); assert.equal(editor.setMode('visual'), false); assert.equal(editor.captureSource(), source);
  }
});

test('one changed paragraph preserves other source regions, spelling, separators and CRLF', () => {
  const source = '  First  \r\n\r\n\t\r\n**Second**\r\n\r\n7. Last\r\n19. Final\r\n';
  const editor = session(source);
  const at = positions(editor.state.doc, 'Second')[0]; editor.select(at, at + 6);
  assert.equal(editor.format('italic'), true);
  assert.ok(editor.source.startsWith('  First  \r\n\r\n\t\r\n'));
  assert.ok(editor.source.endsWith('\r\n\r\n7. Last\r\n19. Final\r\n'));
  assert.equal(editor.undo(), true); assert.equal(editor.source, source);
  assert.equal(editor.redo(), true); assert.ok(editor.source.includes('**_Second_**'));
});

test('literal numeric prefixes and Markdown punctuation survive visual typing and reload', () => {
  for (const value of ['1. ordinary paragraph', '- literal bullet', '## literal heading', '> literal quote', '*literal* [brackets](text)', 'Unicode 雪 e\u0301']) {
    const editor = session(''); assert.equal(editor.insertText(value), true);
    const reloaded = markdown.parseOfficialSource(editor.source, 'question', 'visual_markdown_v1');
    assert.equal(reloaded.mode, 'visual', editor.source);
    assert.equal(reloaded.doc.textContent, value);
    assert.equal(reloaded.doc.firstChild.type.name, 'paragraph');
  }
  const editor = session(''); editor.insertText('1. literal'); assert.equal(editor.source, '1\\. literal');
});

test('adjacent and overlapping strong/em marks have deterministic unambiguous encoding', () => {
  const editor = session('ABCD');
  editor.select(1, 3); editor.format('bold'); editor.select(2, 4); editor.format('italic');
  const first = editor.source;
  const loaded = markdown.parseOfficialSource(first, 'question', 'visual_markdown_v1');
  assert.equal(loaded.mode, 'visual', first);
  assert.equal(markdown.sameDocumentContent(editor.state.doc, loaded.doc), true);
  const again = session(first); again.select(4, 5); again.format('bold'); again.undo(); assert.equal(again.source, first);
});

test('official rendering explicitly distinguishes literal legacy Questions from the bounded v1 grammar', () => {
  const render = currentRenderer();
  for (const source of ['1. literal', '1\\. literal', '_italic_', '**bold and *italic***', '[safe](https://example.test)', '> Quote']) {
    const html = render(source, 'question', 'legacy');
    const dom = new JSDOM(`<body>${html}</body>`);
    assert.equal(dom.window.document.body.textContent, source);
    assert.equal(dom.window.document.body.children.length, 0);
    dom.window.close();
  }
  assert.match(render('1. literal', 'question', 'visual_markdown_v1'), /<ol>/);
  assert.equal(render('1\\. literal', 'question', 'visual_markdown_v1'), '1. literal');
  assert.equal(render('_italic_', 'question', 'visual_markdown_v1'), '<em>italic</em>');
  assert.match(render('**bold and *italic***', 'question', 'visual_markdown_v1'), /<strong>bold and <em>italic<\/em><\/strong>/);
  for (const source of ['**unclosed', '[bad](javascript:alert(1))', '`unsupported`', '<img src=x onerror=x>']) {
    const dom = new JSDOM(`<body>${render(source, 'question', 'visual_markdown_v1')}</body>`);
    assert.equal(dom.window.document.body.textContent, source);
    assert.equal(dom.window.document.querySelector('a,img,script'), null);
    dom.window.close();
  }
  assert.match(render('[safe](https://example.test)', 'concept', 'legacy'), /\[safe\]/);
  assert.match(render('> Quote', 'concept', 'legacy'), /&gt; Quote/);
});

test('Concept image source is stable while adjacent text changes and undo restores exact bytes', () => {
  const source = `Before\r\n\r\n${token(mediaA)}\r\n\r\nAfter\r\n`;
  const editor = session(source, 'concept'); const at = positions(editor.state.doc, 'After')[0];
  editor.select(at, at + 5); editor.format('bold');
  assert.ok(editor.source.startsWith(`Before\r\n\r\n${token(mediaA)}\r\n\r\n`));
  assert.equal(editor.undo(), true); assert.equal(editor.source, source);
});

test('v1 has one newline contract across Concept and Question surfaces', () => {
  const q = markdown.parseOfficialSource('one\r\ntwo', 'question', 'visual_markdown_v1');
  const c = markdown.parseOfficialSource('one\r\ntwo', 'concept', 'visual_markdown_v1');
  assert.equal(q.doc.textContent, 'one\ntwo'); assert.equal(c.doc.textContent, 'one\ntwo');
  assert.equal(q.source, c.source);
  assert.deepEqual(json(q.provenance.regions).map(r => r.raw), ['one\r\ntwo']);
});

test('legacy Questions keep all punctuation literal; selection, focus-equivalent transactions and Preview do not convert', () => {
  const sources = ['_literal_', '**literal**', '***both-looking***', '1. ordinary prose', '## Not a heading', '> not a quote', '[label](https://example.test)', 'a_b * c [d] \\e', '<img src=x onerror=x>', 'one\r\ntwo', '雪 e\u0301 👩🏽‍⚕️'];
  for (const source of sources) {
    const editor = new sessions.OfficialSession(source, 'question');
    assert.equal(editor.formatMarker, 'legacy');
    assert.equal(editor.state.doc.firstChild.type.name, 'paragraph');
    assert.equal(editor.state.doc.textContent, source.replace(/\r\n/g, '\n'));
    assert.ok(!editor.state.doc.firstChild.firstChild.marks.length);
    editor.select(1); editor.format('bold'); // Stored typing marks do not edit text.
    for (const mode of ['preview', 'source', 'visual']) editor.setMode(mode);
    assert.deepEqual(json(editor.captureSurface()), { source, format: 'legacy' });
  }
});

function semanticHtml(html) {
  const dom = new JSDOM(html);
  const walk = element => {
    if (element.nodeType === 3) return { text: element.textContent };
    const children = Array.from(element.childNodes).map(walk);
    return { type: element.tagName.toLowerCase(), children };
  };
  const result = Array.from(dom.window.document.querySelector('.article-body').childNodes).map(walk);
  dom.window.close(); return result;
}
function semanticDoc(doc) {
  const walk = n => {
    if (n.type === 'text') {
      let value = { text: n.text };
      for (const mark of [...n.marks || []].reverse()) value = { type: mark.type === 'strong' ? 'strong' : 'em', children: [value] };
      return value;
    }
    const type = { paragraph: 'p', heading: `h${n.attrs?.level}`, bullet_list: 'ul', ordered_list: 'ol', list_item: 'li' }[n.type];
    const children = n.type === 'list_item' ? n.content[0].content || [] : n.content || [];
    return { type, children: children.map(walk) };
  };
  return doc.content.map(walk);
}

test('legacy Concept semantic import matches the frozen released renderer, including its emphasis quirks', () => {
  const src = readFileSync(new URL('../components/MarkdownContent.tsx', import.meta.url), 'utf8');
  const legacy = src.slice(src.indexOf('function renderInline'), src.indexOf('// Card parsing'));
  assert.equal(createHash('sha256').update(legacy).digest('hex'), 'bb08ed20d484b25733db74108e2bdf22a7a1cd5cd5d762a25c195ba41ca3a269');
  const render = currentRenderer();
  const corpus = ['Plain', '_literal_', '**bold** *italic*', '***combined***', '**bold and *italic***', '*italic and **bold***', '**A***B*', '  A  \r\n B \n\nC', '## Title\n### Minor\nParagraph', '- A\n- B\n\n4. C\n9. D', '1. list\ncontinuation', '> literal quote', '[safe](https://example.test)', '`code` ~~strike~~ <img src=x>', '\\*escaped-looking*', '| a | b |', '- Outer\n  - Inner'];
  for (const source of corpus) {
    const parsed = contentFormat.parseOfficialContent(source, 'concept', 'legacy');
    assert.equal(parsed.mode, 'visual', source);
    assert.deepEqual(json(semanticDoc(parsed.document)), semanticHtml(render(source, 'concept', 'legacy')), source);
    const editor = session(source, 'concept', 'legacy');
    assert.deepEqual(json(editor.captureSurface()), { source, format: 'legacy' });
  }
});

test('a genuine Visual edit converts only its surface and Undo restores original source plus format', () => {
  const source = '_literal_\r\n\r\n1. ordinary prose\r\n\r\n**literal too**';
  const front = session(source, 'question', 'legacy');
  const answer = session('**also literal**', 'question', 'legacy');
  const original = json(front.state.doc.content.toJSON());
  const at = positions(front.state.doc, 'literal')[0]; front.select(at, at + 7);
  assert.equal(front.format('bold'), true);
  assert.equal(front.formatMarker, 'visual_markdown_v1');
  assert.equal(answer.formatMarker, 'legacy'); assert.equal(answer.source, '**also literal**');
  assert.match(front.source, /1\\\. ordinary/); assert.match(front.source, /\\\*\\\*literal too/);
  const loaded = markdown.parseOfficialSource(front.source, 'question', front.formatMarker);
  assert.equal(loaded.mode, 'visual'); assert.equal(markdown.sameDocumentContent(front.state.doc, loaded.doc), true);
  assert.equal(front.undo(), true); assert.deepEqual(json(front.captureSurface()), { source, format: 'legacy' });
  assert.deepEqual(json(front.state.doc.content.toJSON()), original);
  assert.equal(front.redo(), true); assert.equal(front.formatMarker, 'visual_markdown_v1');
});

test('conversion escapes legacy Concept literals without reinterpreting untouched paragraphs', () => {
  const source = '***quirk***\n\n_literal_ [link](https://example.test)\n\n> literal\n\nLast';
  const editor = session(source, 'concept', 'legacy');
  const before = json(editor.state.doc.content.toJSON());
  editor.select(positions(editor.state.doc, 'Last')[0]); editor.insertText('X');
  assert.equal(editor.formatMarker, 'visual_markdown_v1');
  assert.deepEqual(json(editor.state.doc.content.toJSON()).slice(0, 3), before.slice(0, 3));
  const reloaded = markdown.parseOfficialSource(editor.source, 'concept', editor.formatMarker);
  assert.equal(reloaded.mode, 'visual'); assert.equal(markdown.sameDocumentContent(reloaded.doc, editor.state.doc), true);
  editor.undo(); assert.deepEqual(json(editor.captureSurface()), { source, format: 'legacy' });
});

test('v1 serializer closes over all adjacent Bold/Italic combinations and literal punctuation', () => {
  const vocabulary = ['none', 'bold', 'italic', 'both'];
  for (const first of vocabulary) for (const second of vocabulary) for (const third of vocabulary) {
    const editor = session('ABC');
    [first, second, third].forEach((mark, i) => {
      editor.select(i + 1, i + 2);
      if (mark === 'bold' || mark === 'both') assert.equal(editor.format('bold'), true, [first, second, third].join(','));
      if (mark === 'italic' || mark === 'both') assert.equal(editor.format('italic'), true, [first, second, third].join(','));
    });
    const parsed = markdown.parseOfficialSource(editor.source, 'question', 'visual_markdown_v1');
    assert.equal(parsed.mode, 'visual'); assert.equal(markdown.sameDocumentContent(editor.state.doc, parsed.doc), true);
  }
  for (const source of ['_*[]().-#>\\', '`code` ~~strike~~ <script> & !image', '1. prose\n2. more', '雪 e\u0301 👩🏽‍⚕️']) {
    const editor = session(source, 'question', 'legacy'); editor.select(1, editor.state.doc.firstChild.content.size + 1);
    assert.equal(editor.format('bold'), true, source);
    const parsed = markdown.parseOfficialSource(editor.source, 'question', editor.formatMarker);
    assert.equal(parsed.mode, 'visual'); assert.equal(parsed.doc.textContent, editor.state.doc.textContent);
  }
});

test('v1 round trips empty paragraphs and list/quote editing states without dropping content', () => {
  for (const command of [null, 'bulleted-list', 'numbered-list', 'quote', 'heading']) {
    const editor = session('First'); editor.select(6); if (command) editor.format(command);
    assert.equal(editor.enter(), true, String(command));
    const loaded = markdown.parseOfficialSource(editor.source, 'question', editor.formatMarker);
    assert.equal(loaded.mode, 'visual', editor.source);
    assert.equal(markdown.sameDocumentContent(editor.state.doc, loaded.doc), true, String(command));
    editor.insertText('Last'); assert.equal(editor.state.doc.textContent, 'FirstLast');
  }
});

test('unknown markers fail closed and only missing old Answer snapshot metadata means legacy', () => {
  assert.equal(contentFormat.snapshotAnswerFormat(undefined), 'legacy');
  for (const value of [null, '', 'future_format']) {
    assert.throws(() => contentFormat.officialContentFormat(value), /Unknown/);
    assert.throws(() => contentFormat.snapshotAnswerFormat(value), /Unknown/);
    const parsed = contentFormat.parseOfficialContent('**source**', 'question', value);
    assert.equal(parsed.mode, 'source'); assert.equal(parsed.source, '**source**');
  }
});
