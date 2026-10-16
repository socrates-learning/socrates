import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { document, contentFormat, pm } from './official-authoring.mjs';

const require = createRequire(import.meta.url);
export const React = require('react');
const jsx = require('react/jsx-runtime');
const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
function compile(path, modules, extra = {}) {
  const context = { exports: {}, URL, queueMicrotask, ...extra, require(id) {
    if (Object.hasOwn(modules, id)) return modules[id];
    if (id.startsWith('prosemirror-')) return pm(id);
    assert.ok(Object.hasOwn(modules, id), `Unexpected personal editor dependency: ${id}`); return modules[id];
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context, { filename: path });
  return context.exports;
}
export const reader = compile('components/MarkdownContent.tsx', {
  react: React, 'react/jsx-runtime': jsx, '@/lib/official-content-format': contentFormat, './MarkdownContent.module.css': css,
});
export const model = compile('lib/personal-card-authoring.ts', {
  react: React, '@/components/MarkdownContent': reader, '@/lib/official-authoring/document': document,
});
export function render(source) {
  return require('react-dom/server').renderToStaticMarkup(React.createElement(reader.MarkdownContent, { markdown: source, mode: 'card' }));
}

export async function mountPersonalField(initial = {}) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true, url: 'https://disposable.example.test' });
  dom.window.Range.prototype.getClientRects = () => [];
  dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const saved = new Map();
  for (const key of ['window', 'document', 'navigator', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement', 'Event', 'KeyboardEvent']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value: ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(key) ? dom.window[key].bind(dom.window) : dom.window[key] });
  }
  saved.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  let mountedView;
  class MountedView extends pm('prosemirror-view').EditorView {
    constructor(...args) {
      super(...args);
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- Drive the real mounted editor in tests.
      mountedView = this;
    }
  }
  const toolbar = compile('components/creator/OfficialAuthoringToolbar.tsx', { react: React, 'react/jsx-runtime': jsx, '../CreatorStudioV2Client.module.css': css });
  const { PersonalCardField } = compile('components/creator/PersonalCardField.tsx', {
    react: React, 'react/jsx-runtime': jsx, '@/lib/official-content-format': contentFormat,
    '@/components/MarkdownContent': reader, '@/lib/personal-card-authoring': model,
    './OfficialAuthoringToolbar': toolbar, '../CreatorStudioV2Client.module.css': css, './OfficialVisualField.module.css': css,
    'prosemirror-view': { EditorView: MountedView },
  });
  let controls, current;
  const writes = [], composing = [];
  const root = createRoot(dom.window.document.getElementById('root'));
  function Harness() {
    const [props, setProps] = React.useState({ label: 'Front', value: 'Selected', maxLength: 10000, ...initial });
    React.useLayoutEffect(() => { controls = setProps; current = props; }, [props]);
    return React.createElement(PersonalCardField, { ...props, onComposing: value => composing.push(value), onChange: value => {
      writes.push(value); setProps(p => ({ ...p, value }));
    } });
  }
  async function act(action) { await React.act(async () => { await action?.(); await new Promise(resolve => setTimeout(resolve, 0)); }); }
  await act(() => root.render(React.createElement(Harness)));
  return { dom, writes, composing, act, get props() { return current; },
    get view() { return mountedView; },
    button(label) { const candidates = [...dom.window.document.querySelectorAll('button')].filter(b => b.textContent === label || b.getAttribute('aria-label') === label); assert.equal(candidates.length, 1, label); return candidates[0]; },
    async click(label) { await act(() => this.button(label).click()); },
    async update(props) { await act(() => controls(p => ({ ...p, ...props }))); },
    async select(from, to = from) { await act(() => this.view.dispatch(this.view.state.tr.setSelection(pm('prosemirror-state').TextSelection.create(this.view.state.doc, from, to)))); },
    async type(text) { await act(() => this.view.dispatch(this.view.state.tr.insertText(text))); },
    async input(element, value) { await act(() => {
      const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    }); },
    async close() { await act(() => root.unmount()); dom.window.close(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}
