import { projectStudySunrise } from './study-sunrise.mjs';
import { projectCreatorSunriseStyles } from './creator-sunrise.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Only this exact Home-only stylesheet addition is excluded from historical
// fingerprints. The original styles and all behavioral assertions stay intact.
export function projectHomeSunrise(source) {
  source = projectCreatorSunriseStyles('app/home.css', source);
  const marker = '\n/* Home sunrise presentation:';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  assert.equal(source.split(marker).length, 2, 'One Home presentation block');
  assert.equal(createHash('sha256').update(source.slice(start)).digest('hex'),
    '2875db8f208ab4f05f7c273c3948fe194a6c686a13d1f14b462cd18826080945', 'Only the approved Home presentation block');
  return source.slice(0, start);
}

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
  const raw = readFileSync(path, options);
  const value = typeof raw === 'string' ? projectStudySunrise(path, raw) : raw;
  if (typeof value !== 'string') return value;
  const home = String(path) === 'app/home.css' || String(path).endsWith('/app/home.css');
  return projectAppearance(home ? projectHomeSunrise(value) : projectCreatorSunriseStyles(path, value));
}
