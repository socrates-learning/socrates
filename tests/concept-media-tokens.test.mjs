import test from 'node:test';
import assert from 'node:assert/strict';
import { conceptMedia as m, ids } from './fixtures/concept-media-authoring.mjs';
const second = '11400000-0000-4000-8000-000000000003';
const token = m.conceptMediaToken(ids.placement);
const placement = { placementId: ids.placement, assetId: ids.asset, ordinal: 0, altText: 'Synthetic figure', caption: '' };

test('Concept tokens are stable UUID block references, never URLs or inline images', () => {
  assert.equal(token, `[[socrates-media:${ids.placement}]]`);
  assert.deepEqual(m.conceptMediaBlocks(`Before\n\n${token}\n\nAfter`), [{ id: ids.placement, line: 2 }]);
  for (const bad of ['https://example.test/image', 'not-an-id', ids.placement.toUpperCase().replace('114', 'ABC')]) assert.throws(() => m.conceptMediaToken(bad));
  for (const literal of [`Inline ${token} text`, '[[socrates-media:missing]]', '<img src="x">']) assert.deepEqual(m.conceptMediaBlocks(literal), []);
});
test('Concept parser rejects duplicate, adjacent-text and oversized active tokens', () => {
  assert.throws(() => m.conceptMediaBlocks(`${token}\n\n${token}`), /only once/);
  assert.throws(() => m.conceptMediaBlocks(`Text\n${token}`), /blank line/);
  assert.throws(() => m.conceptMediaBlocks(`${token}\nText`), /blank line/);
  assert.throws(() => m.conceptMediaBlocks('x'.repeat(m.MAX_MEDIA_SOURCE + 1)), /too large/);
  assert.equal(m.conceptMediaBlocks('x'.repeat(m.MAX_MEDIA_SOURCE)).length, 0);
});
test('insertion preserves prose, lists, Unicode and CRLF while choosing a block boundary', () => {
  for (const [source, cursor, expected] of [
    ['', 0, token], ['First paragraph', 3, `First paragraph\n\n${token}`],
    ['First\n\nSecond', 3, `First\n\n${token}\n\nSecond`],
    ['First\n\nSecond', 7, `First\n\n${token}\n\nSecond`],
    ['- one\n- two\n\nAfter', 4, `- one\n- two\n\n${token}\n\nAfter`],
    ['é 中文\r\n\r\nNext', 2, `é 中文\r\n\r\n${token}\r\n\r\nNext`],
    ['Start', 0, `${token}\n\nStart`],
  ]) {
    const result = m.insertConceptMedia(source, cursor, ids.placement);
    assert.equal(result.value, expected);
    assert.equal(result.selectionStart, expected.indexOf(token) + token.length);
    assert.equal(result.selectionEnd, result.selectionStart);
    assert.equal(m.conceptMediaBlocks(result.value).length, 1);
  }
});
test('manifest order comes from source, requires accessible metadata and removes only omitted references', () => {
  const other = { ...placement, placementId: second, altText: 'Second' };
  assert.deepEqual(m.orderedConceptMedia(`${m.conceptMediaToken(second)}\n\n${token}`, [placement, other]).map(p => [p.placementId, p.ordinal]), [[second, 0], [ids.placement, 1]]);
  assert.deepEqual(m.orderedConceptMedia('Plain prose', [placement]), []);
  assert.throws(() => m.orderedConceptMedia(token, []), /missing/);
  assert.throws(() => m.orderedConceptMedia(token, [placement, placement]), /Duplicate/);
  for (const change of [{ altText: ' ' }, { altText: 'x'.repeat(2001) }, { caption: 'x'.repeat(4001) }]) assert.throws(() => m.orderedConceptMedia(token, [{ ...placement, ...change }]));
});
test('fingerprint includes content metadata and identity but excludes temporary delivery metadata', () => {
  const fingerprint = m.conceptMediaFingerprint([placement]);
  assert.equal(m.conceptMediaFingerprint([{ ...placement, reservationId: second, sha256: 'a'.repeat(64), width: 100 }]), fingerprint);
  for (const change of [{ assetId: second }, { altText: 'Changed' }, { caption: 'Changed' }, { ordinal: 1 }]) assert.notEqual(m.conceptMediaFingerprint([{ ...placement, ...change }]), fingerprint);
});
test('removal and title projection preserve all unrelated Markdown bytes and malformed text', () => {
  const source = `# Heading\r\n\r\n${token}\r\n\r\n**Body**`;
  assert.equal(m.removeConceptMedia(source, ids.placement), '# Heading\r\n\r\n\r\n\r\n**Body**');
  assert.equal(m.withoutConceptMediaTokens(source), '# Heading\r\n\r\n\r\n**Body**');
  assert.equal(m.withoutConceptMediaTokens('[[socrates-media:broken]]'), '[[socrates-media:broken]]');
  assert.equal(m.withoutConceptMediaTokens(`Text\n${token}`), `Text\n${token}`);
});

test('Write projection preserves exact stored source and displays ordered images between editable Markdown', () => {
  for (const newline of ['\n', '\r\n']) {
    const source = ['# Before é 中文', token, '**Between**', m.conceptMediaToken(second), '> After'].join(newline + newline);
    const parts = m.conceptMediaWriteParts(source);
    assert.deepEqual(parts.map(p => p.kind), ['text', 'image', 'text', 'image', 'text']);
    assert.deepEqual(parts.filter(p => p.kind === 'text').map(p => p.text), ['# Before é 中文', '**Between**', '> After']);
    assert.deepEqual(parts.filter(p => p.kind === 'image').map(p => p.placementId), [ids.placement, second]);
    assert.equal(parts.map(p => source.slice(p.start, p.end)).join(''), source);
    for (const part of parts.filter(p => p.kind === 'text')) {
      assert.equal(m.editConceptMediaText(source, part, part.text).source, source);
      assert.ok(!part.text.includes('[[socrates-media:'));
    }
  }
});
test('text can be added before, between and after image-only blocks without breaking protected boundaries', () => {
  const source = `${token}\n\n${m.conceptMediaToken(second)}`;
  const parts = m.conceptMediaWriteParts(source);
  for (const part of parts.filter(p => p.kind === 'text')) {
    const result = m.editConceptMediaText(source, part, '**Added text**');
    assert.deepEqual(m.conceptMediaBlocks(result.source).map(b => b.id), [ids.placement, second]);
    assert.equal(result.source.slice(result.offset, result.offset + 14), '**Added text**');
    assert.equal(m.conceptMediaWriteParts(result.source).filter(p => p.kind === 'text').some(p => p.text === '**Added text**'), true);
  }
});
test('unavailable, inline and incomplete image references cannot leak raw internal syntax into Write fields', () => {
  for (const source of [`Inline ${token} after`, '[[socrates-media:broken]]', 'Before\n[[socrates-media:unfinished', `${token}\n${token}`]) {
    const parts = m.conceptMediaWriteParts(source);
    assert.equal(parts.map(p => source.slice(p.start, p.end)).join(''), source);
    assert.ok(parts.some(p => p.kind === 'image'));
    assert.ok(parts.filter(p => p.kind === 'text').every(p => !p.text.includes('[[socrates-media:')));
  }
});
