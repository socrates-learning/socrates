import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Only color-token wrappers are projected away. The original Light values,
// selectors, layout, handlers and all pre-existing fingerprints remain authoritative.
const names = 'surface|soft|text|muted|line|strong|link|focus|danger|danger-fill|success|success-fill|warning|warning-fill';
export function projectAppearance(source) {
  const pattern = new RegExp(`var\\(--appearance-(?:${names}), `);
  let match;
  while ((match = pattern.exec(source))) {
    const start = match.index + match[0].length;
    let depth = 1, end = start;
    while (end < source.length && depth) {
      if (source[end] === '(') depth++;
      if (source[end] === ')') depth--;
      end++;
    }
    assert.equal(depth, 0, 'Balanced appearance token');
    const fallback = source.slice(start, end - 1);
    assert.match(fallback, /^(?:#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s/%]+\)|white|black|var\(--(?:navy|creator-navy|ink)\))$/, 'Appearance exception is a color only');
    source = source.slice(0, match.index) + fallback + source.slice(end);
  }
  return source;
}

export function readAppearanceSource(path, options) {
  const value = readFileSync(path, options);
  return typeof value === 'string' ? projectAppearance(value) : value;
}
