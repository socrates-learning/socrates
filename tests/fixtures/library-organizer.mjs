import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real component with bounded in-memory hooks and explicit imports.
// This characterizes handler wiring, not actual React layout, database RLS or persistence.
export const source = readFileSync(new URL('../../components/LibraryOrganizerClient.tsx', import.meta.url), 'utf8');
const captureMarker = '  return (\n    <>\n      <Header />';
assert.equal(source.split(captureMarker).length, 2);
const compiled = ts.transpileModule(source.replace(captureMarker,
  `  capture({ loadOrganization, createGroup, renameSelectedGroup, moveSelectedGroup, reorderSelectedGroup, archiveSelectedGroup, deleteSelectedGroup, createLibrary, renameSelectedLibrary, moveSelectedLibrary, saveSelectedLibraryStatus, deleteSelectedLibrary, selectedGroupId, selectedLibraryId, pendingArchiveGroupId, status, isLoading, isMutating });\n${captureMarker}`),
{ compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const styles = Object.fromEntries([...readFileSync(new URL('../../components/LibraryOrganizerClient.module.css', import.meta.url), 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => [match[1], match[1]]));
export const fixture = {
  library_groups: [
    { id: 'group-a', parent_id: null, name: 'Health Sciences', slug: 'health-sciences', sort_order: 0, status: 'active' },
    { id: 'group-child', parent_id: 'group-a', name: 'Nested Group', slug: 'nested', sort_order: 0, status: 'active' },
    { id: 'group-empty', parent_id: null, name: 'Empty Group', slug: 'empty', sort_order: 1, status: 'active' },
    { id: 'group-archive', parent_id: null, name: 'Archived Group', slug: 'archive', sort_order: 2, status: 'archived' },
  ],
  libraries: [
    { id: 'library-a', name: 'Library A', slug: 'a', description: null, status: 'active' },
    { id: 'library-b', name: 'Library B', slug: 'b', description: null, status: 'inactive' },
    { id: 'library-unorganized', name: 'Unorganized Library', slug: 'unorganized', description: null, status: 'active' },
  ],
  library_group_libraries: [
    { group_id: 'group-a', library_id: 'library-a', sort_order: 0 },
    { group_id: 'group-child', library_id: 'library-b', sort_order: 0 },
  ],
  library_nodes: [
    { id: 'root-a', library_id: 'library-a', parent_id: null, name: 'Library A' },
    { id: 'child-a', library_id: 'library-a', parent_id: 'root-a', name: 'Topic A' },
    { id: 'root-b', library_id: 'library-b', parent_id: null, name: 'Library B' },
  ],
};
export function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}
export function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  if (value == null || typeof value === 'boolean') return '';
  return typeof value === 'object' ? text(value.props?.children) : String(value);
}
export function button(tree, label) {
  const found = nodes(tree).filter(n => n.type === 'button' && text(n).trim() === label);
  assert.equal(found.length, 1, `Expected one button: ${label}`);
  return found[0];
}
export function control(tree, label) {
  const found = nodes(tree).filter(n => n.props?.['aria-label'] === label);
  assert.equal(found.length, 1, `Expected one control: ${label}`);
  return found[0];
}
export function organizer({ data = fixture, read, rpc, confirm = () => true } = {}) {
  const slots = []; const reads = []; const calls = []; const confirmations = [];
  let cursor = 0, dirty = true, pending = 0, tree, api;
  let effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => { const next = typeof value === 'function' ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; } }];
    },
    useMemo(fn, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value; },
    useEffect(fn, deps) { const index = cursor++; if (!slots[index] || !same(slots[index].deps, deps)) { slots[index] = { deps }; effects.push(fn); } },
  };
  function tracked(fn) { pending++; return Promise.resolve().then(fn).finally(() => { pending--; }); }
  const database = {
    from(table) {
      assert.ok(Object.hasOwn(fixture, table), `Unexpected table: ${table}`);
      const query = { table, select: null, order: [] };
      const builder = {
        select(columns) { query.select = columns; return builder; },
        order(column) { query.order.push(column); return builder; },
        then(resolve, reject) { reads.push(query); return tracked(() => read ? read(query) : { data: data[table], error: null }).then(resolve, reject); },
      };
      return builder;
    },
    rpc(name, payload) {
      const allowed = ['create_library_group', 'rename_library_group', 'move_library_group', 'reorder_library_group', 'archive_library_group', 'create_library_with_root', 'rename_library_with_root', 'move_library_to_group', 'set_library_organizer_status', 'get_development_delete_summary', 'delete_development_content'];
      assert.ok(allowed.includes(name), `Unexpected RPC: ${name}`);
      calls.push({ name, payload: structuredClone(payload) });
      return tracked(() => rpc ? rpc(name, payload) : { data: null, error: null });
    },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const imports = {
    react: hooks,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'next/link': { __esModule: true, default: 'a' },
    'lucide-react': Object.fromEntries(['Archive','ArrowLeft','Folder','Info','Library','Plus'].map(name => [name, `icon:${name}`])),
    '@/components/Header': { Header: 'Header' },
    '@/lib/supabase': { supabase: database },
    './CreatorStudioV2Client.module.css': { __esModule: true, default: { staffWorkspace: 'staffWorkspace' } },
    './LibraryOrganizerClient.module.css': { __esModule: true, default: styles },
  };
  const context = { exports: {}, require(name) { assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`); return imports[name]; }, capture(value) { api = value; }, window: { confirm(warning) { confirmations.push(warning); return confirm(warning); } } };
  vm.runInNewContext(compiled, context);
  function render() { cursor = 0; dirty = false; tree = context.exports.LibraryOrganizerClient(); return { tree, ...api }; }
  async function settle() {
    for (let count = 0; count < 50; count++) {
      if (dirty) render();
      const queued = effects; effects = []; queued.forEach(effect => effect());
      await new Promise(resolve => setImmediate(resolve));
      if (!dirty && !pending && !effects.length) return { tree, ...api };
    }
    throw new Error('Organizer harness did not settle; unresolved read/RPC or render loop');
  }
  return { render, settle, reads, calls, confirmations, get current() { return { tree, ...api }; },
    async change(label, value) { control(tree, label).props.onChange({ target: { value } }); return settle(); },
    async click(label) { const item = button(tree, label); assert.notEqual(item.props.disabled, true, `Disabled button: ${label}`); item.props.onClick(); return settle(); },
  };
}
