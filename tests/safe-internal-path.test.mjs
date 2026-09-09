import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(
  new URL('../lib/safe-internal-path.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, URL, decodeURIComponent });
const { getSafeInternalPath } = exports;

test('accepts normalized internal Socrates paths', () => {
  const accepted = [
    '/',
    '/creator/concepts/new',
    '/stats?range=30#recent',
    '/study-creator?topic=abc&concept=def',
    '/library/nursing',
  ];

  for (const value of accepted) {
    assert.equal(getSafeInternalPath(value), value);
  }
});

test('rejects external, scheme, malformed, and normalization-bypass values', () => {
  const rejected = [
    '//example.test/escape',
    '///example.test/escape',
    'https://example.test/escape',
    'http://example.test/escape',
    'javascript:alert(1)',
    'data:text/html,escape',
    '/\\example.test/escape',
    '\\example.test/escape',
    '/%2f%2fexample.test/escape',
    '/%252f%252fexample.test/escape',
    '/%5cexample.test/escape',
    '/%255cexample.test/escape',
    '/%E0%A4%A',
    ' /creator/concepts/new',
    '/creator/concepts/new ',
    '/creator\n/concepts',
  ];

  for (const value of rejected) {
    assert.equal(getSafeInternalPath(value), '/', value);
  }
});

test('uses the caller fallback for an invalid equivalent redirect', () => {
  assert.equal(
    getSafeInternalPath('/\\example.test', '/library/nursing'),
    '/library/nursing'
  );
});
