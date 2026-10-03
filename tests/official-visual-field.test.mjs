import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { session, sessions, pm, token, mediaA } from './fixtures/official-authoring.mjs';

function mounted(source = '', flavor = 'question') {
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', { pretendToBeVisual: true, url: 'https://disposable.example.test' });
  const saved = new Map();
  for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value: typeof dom.window[key] === 'function' ? dom.window[key].bind(dom.window) : dom.window[key] });
  }
  const editor = session(source, flavor);
  const view = new (pm('prosemirror-view').EditorView)(dom.window.document.getElementById('editor'), sessions.foundationViewProps(editor));
  return { dom, editor, view, close() { view.destroy(); dom.window.close(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } } };
}

test('real EditorView renders marks and restores selection without a Creator mount', () => {
  const h = mounted('**Bold** and *italic*');
  try {
    assert.equal(h.view.dom.querySelector('strong').textContent, 'Bold'); assert.equal(h.view.dom.querySelector('em').textContent, 'italic');
    const source = h.editor.source; h.view.focus(); assert.equal(h.editor.source, source);
    h.view.dispatch(h.editor.state.tr.insertText('X', 1)); assert.ok(h.editor.source.includes('X')); assert.equal(h.view.state, h.editor.state);
    assert.equal(h.view.dom.getAttribute('aria-multiline'), 'true');
  } finally { h.close(); }
});

test('paste intercepts HTML before default parsing and never imports a remote image', () => {
  const h = mounted();
  try {
    const reads = [];
    const event = new h.dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { files: [], getData(type) { reads.push(type); return type === 'text/plain' ? '1. ordinary text' : type === 'text/html' ? '<img src="https://not-requested.example/x">' : ''; } } });
    h.view.dom.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true); assert.equal(reads.includes('text/html'), false);
    assert.equal(h.view.dom.querySelector('img'), null); assert.equal(h.view.dom.textContent, '1. ordinary text'); assert.equal(h.editor.source, '1\\. ordinary text');
  } finally { h.close(); }
});

test('protected Concept node is noneditable and text deletion cannot remove it', () => {
  const h = mounted(`A\n\n${token(mediaA)}\n\nB`, 'concept');
  try {
    const image = h.view.dom.querySelector('[role="img"]'); assert.ok(image); assert.equal(image.getAttribute('contenteditable'), 'false');
    const source = h.editor.source;
    h.view.dispatch(h.editor.state.tr.setSelection(new (pm('prosemirror-state').AllSelection)(h.editor.state.doc)).deleteSelection());
    assert.equal(h.editor.source, source); assert.ok(h.view.dom.querySelector('[role="img"]'));
    assert.doesNotMatch(h.view.dom.innerHTML, new RegExp(mediaA));
  } finally { h.close(); }
});

test('synthetic composition events exercise the adapter guard, not a claim of native IME proof', () => {
  const h = mounted();
  try {
    h.view.dom.dispatchEvent(new h.dom.window.CompositionEvent('compositionstart', { bubbles: true }));
    assert.equal(h.editor.composing, true); assert.throws(() => h.editor.captureSource(h.view), /composition/);
    h.view.dom.dispatchEvent(new h.dom.window.CompositionEvent('compositionend', { bubbles: true }));
    assert.equal(h.editor.composing, false);
  } finally { h.close(); }
});
