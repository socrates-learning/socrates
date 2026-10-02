import sharp from 'sharp';
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
export function loadMediaModule(file, overrides = {}) {
  const location = new URL(`../../${file}`, import.meta.url);
  const require = createRequire(location);
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(location, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name), Buffer, process, setTimeout, clearTimeout, AbortSignal, Response, Request, URL, fetch, Uint8Array }, { filename: location.pathname });
  return loadedModule.exports;
}
export async function sampleImage(format = 'png', width = 64, height = 32) {
  return sharp({ create: { width, height, channels: 3, background: '#416282' } })[format]().toBuffer();
}
export { sharp };
