import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../app/auth/callback/page.tsx', import.meta.url), 'utf8')
  + '\nexport { AuthCallbackContent };';
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

async function callback({ query = '', hash = '', recovery = false, invalid = false, replay = false } = {}) {
  let effect, listener;
  const redirects = [], messages = [], calls = [];
  const auth = {
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { listener = null; } } } }; },
    async exchangeCodeForSession(code) {
      calls.push(['exchange', code]);
      await Promise.resolve();
      if (invalid) return { data: { session: null }, error: new Error('Consumed or expired') };
      listener?.(recovery ? 'PASSWORD_RECOVERY' : 'SIGNED_IN');
      return { data: { session: { user: { id: 'synthetic' } } }, error: null };
    },
    async setSession(tokens) {
      calls.push(['setSession', tokens]);
      return { data: { session: invalid ? null : {} }, error: invalid ? new Error('Invalid') : null };
    },
  };
  const exports = {};
  const context = {
    exports, URL, URLSearchParams, console,
    window: { location: { hash, origin: 'https://socrates.example' } },
    require(name) {
      if (name === 'react') return {
        Suspense() {}, useEffect(fn) { effect = fn; }, useRef(value) { return { current: value }; },
        useState() { return ['', value => messages.push(value)]; },
      };
      if (name === 'react/jsx-runtime') return { jsx() {}, jsxs() {} };
      if (name === 'next/navigation') return { useRouter: () => ({ replace: path => redirects.push(path) }), useSearchParams: () => new URLSearchParams(query) };
      if (name === '@/lib/supabase') return { supabase: { auth } };
      throw new Error(name);
    },
  };
  vm.runInNewContext(compiled, context);
  exports.AuthCallbackContent();
  const cleanup = effect();
  if (replay) { cleanup(); effect(); }
  await new Promise(resolve => setImmediate(resolve));
  return { redirects, messages, calls };
}

test('StrictMode replay exchanges a recovery code once and routes after session establishment', async () => {
  const result = await callback({ query: 'code=synthetic', recovery: true, replay: true });
  assert.deepEqual(result.calls, [['exchange', 'synthetic']]);
  assert.deepEqual(result.redirects, ['/reset-password']);
  assert.deepEqual(result.messages, []);
});
test('normal magic-link callback preserves its same-origin destination', async () => {
  assert.deepEqual((await callback({ query: 'code=synthetic&next=/creator?tab=questions' })).redirects, ['/creator?tab=questions']);
});
test('new recovery links carry an explicit reset destination', async () => {
  assert.deepEqual((await callback({ query: 'code=synthetic&next=/reset-password' })).redirects, ['/reset-password']);
});
test('invalid or consumed code and missing credentials never accept an existing session', async () => {
  for (const options of [{ query: 'code=bad', invalid: true }, {}, { hash: '#error=access_denied&error_description=Expired' }]) {
    const result = await callback(options);
    assert.deepEqual(result.redirects, []);
    assert.match(result.messages[0], /invalid, expired, or already used/);
  }
});
test('legacy recovery hash is established exactly once before routing', async () => {
  const result = await callback({ hash: '#access_token=synthetic&refresh_token=synthetic-refresh&type=recovery', replay: true });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0][0], 'setSession');
  assert.deepEqual(result.redirects, ['/reset-password']);
});
test('callback destination cannot escape the current origin', async () => {
  for (const next of ['//example.test/escape', '/\\example.test/escape', 'https://example.test/escape']) {
    const result = await callback({ query: 'code=synthetic&next=' + encodeURIComponent(next) });
    assert.deepEqual(result.redirects, ['/']);
  }
});
