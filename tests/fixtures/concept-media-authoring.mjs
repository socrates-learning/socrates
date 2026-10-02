import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import * as conceptMedia from '../../lib/concept-media.ts';

export { conceptMedia };
export const ids = {
  library: '11200000-0000-4000-8000-000000000010',
  admin: '11200000-0000-4000-8000-000000000001',
  editor: '11200000-0000-4000-8000-000000000002',
  learner: '11200000-0000-4000-8000-000000000003',
  topic: '11200000-0000-4000-8000-000000000020',
  placement: '11400000-0000-4000-8000-000000000001',
  asset: '11400000-0000-4000-8000-000000000002',
};
export const passiveConceptImages = () => ({
  dirty: false, guardActive: false, usesMedia: false, pending: false, entered: false,
  items: [], context: null, inspector: null, error: '',
  open() {}, reset() {}, clear() {},
});
export const conceptImageBoundary = {
  __esModule: true,
  default: function ConceptImageAuthoring() {},
  ConceptImageWriteEditor: function ConceptImageWriteEditor() {},
  useConceptImageAuthoring: passiveConceptImages,
};
export const conceptContentBoundary = { __esModule: true, default: function ConceptMediaContent() {} };

/** Explicit imports only; unexpected component dependencies are rejected. */
export function loadConceptModule(file, modules, globals = {}) {
  const full = path.resolve(file);
  const source = fs.readFileSync(full, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const context = { exports: {}, require(name) { if (Object.hasOwn(modules, name)) return modules[name]; throw Error(`Unexpected import: ${name}`); }, Buffer, URL, URLSearchParams, Request, Response, AbortController, AbortSignal, setTimeout, clearTimeout, Uint8Array, ...globals };
  context.require.resolve = createRequire(full).resolve;
  vm.runInNewContext(output, context, { filename: file });
  return context.exports;
}

export const jsx = { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
export function hookHarness() {
  const values = [], effects = [], refs = [];
  let cursor = 0, refCursor = 0, effectCursor = 0;
  return {
    hooks: {
      useState(initial) { const at = cursor++; if (!(at in values)) values[at] = typeof initial === 'function' ? initial() : initial; return [values[at], update => { values[at] = typeof update === 'function' ? update(values[at]) : update; }]; },
      useRef(initial) { const at = refCursor++; return refs[at] ||= { current: initial }; },
      useImperativeHandle(ref, create) { ref.current = create(); },
      useEffect(fn, deps) { const at = effectCursor++; const old = effects[at]; if (!old || deps.some((d, i) => d !== old.deps[i])) effects[at] = { fn, deps, oldCleanup: old?.cleanup, pending: true }; },
    },
    render(fn) { cursor = 0; refCursor = 0; effectCursor = 0; return fn(); },
    effects() { for (const effect of effects) if (effect.pending) { effect.oldCleanup?.(); effect.cleanup = effect.fn(); effect.pending = false; } },
    cleanup() { for (const effect of effects) effect.cleanup?.(); },
  };
}
