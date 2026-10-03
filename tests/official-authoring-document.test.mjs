import assert from 'node:assert/strict';
import test from 'node:test';
import { document, markdown, pm, mediaA, mediaB, token } from './fixtures/official-authoring.mjs';

test('schema allows only bounded prose and Concept-only opaque placements', () => {
  const q = document.questionSchema, c = document.conceptSchema;
  assert.deepEqual(Object.keys(q.nodes), ['doc', 'paragraph', 'heading', 'bullet_list', 'ordered_list', 'list_item', 'blockquote', 'text']);
  assert.deepEqual(Object.keys(q.marks), ['strong', 'em', 'link']);
  assert.ok(c.nodes.concept_media); assert.equal(q.nodes.concept_media, undefined);
  for (const name of ['image', 'table', 'html', 'code_block', 'video']) assert.equal(c.nodes[name], undefined);
  assert.throws(() => q.nodes.doc.create(null, q.nodes.heading.create({ level: 1 }, q.text('Title'))).check(), /Unsupported heading/);
  const nested = q.nodes.list_item.create(null, [q.nodes.paragraph.create(null, q.text('A')), q.nodes.bullet_list.create(null, q.nodes.list_item.create(null, q.nodes.paragraph.create()))]);
  assert.throws(() => nested.check(), /Invalid content/);
});

test('image blocks cannot carry a URL and must be unique top-level identities', () => {
  const parsed = markdown.parseOfficialSource(`A\n\n${token(mediaA)}\n\nB\n\n${token(mediaB)}`, 'concept', 'visual_markdown_v1');
  assert.equal(parsed.mode, 'visual'); document.validateDocument(parsed.doc);
  const image = parsed.doc.child(1);
  assert.equal(image.type.spec.atom, true); assert.equal(image.type.spec.isolating, true);
  assert.equal(image.type.spec.selectable, false); assert.equal(image.type.spec.draggable, false);
  assert.deepEqual(Object.keys(image.attrs), ['placementId']);
  assert.equal(JSON.stringify(image.type.spec.toDOM(image)).includes(mediaA), false);
  assert.equal(markdown.parseOfficialSource(`${token(mediaA)}\n\n${token(mediaA)}`, 'concept', 'visual_markdown_v1').mode, 'source');
  assert.equal(markdown.parseOfficialSource(token(mediaA), 'question', 'visual_markdown_v1').mode, 'source');
});

test('safe links reject unsafe and obfuscated destinations without fetching', () => {
  for (const value of ['https://example.test/a_(b)', 'http://example.test', 'HTTPS://example.test']) assert.equal(document.safeLink(value), value);
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//example.test', '/path', 'mailto:a@example.test', 'https://a\u0000.test', 'https://a b.test', 'https://a\\@b.test', 'https&#58;//example.test']) assert.equal(document.safeLink(value), null);
});

test('framework schema DOM output uses text nodes and fixed structures', () => {
  const { DOMSerializer } = pm('prosemirror-model');
  assert.ok(DOMSerializer.fromSchema(document.questionSchema));
  assert.deepEqual(Array.from(document.questionSchema.marks.strong.spec.toDOM()), ['strong', 0]);
  assert.deepEqual(Array.from(document.questionSchema.marks.em.spec.toDOM()), ['em', 0]);
});
