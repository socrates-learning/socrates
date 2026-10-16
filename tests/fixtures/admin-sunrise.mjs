import { projectHomeHubNavigation } from './study-sunrise.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Reversible Admin-only presentation additions. The approved Creator hashes
// and reference copies remain unchanged, including its desktop scrolling.
export function projectAdminPresentation(path, source) {
  source = projectHomeHubNavigation(path, source);
  if (String(path).endsWith('SocratesShell.module.css') && source.includes('[data-admin-shell]')) {
    const marker = '\n/* Creator sunrise header:';
    const start = source.indexOf(marker);
    assert.ok(start >= 0);
    assert.equal(createHash('sha256').update(source.slice(start)).digest('hex'), '0cd46add3651fe5d447cf52e31ab924aa2af65daa5e66ea4a71b0e6f7252f2a1', 'Exact shared-header Admin extension');
    const ending = '\n/* Admin uses the shared sunrise header without changing Creator workspace scrolling. */\n.branded[data-admin-shell] { min-height: 100dvh; }\n';
    assert.ok(source.endsWith(ending));
    source = source.slice(0, -ending.length).replaceAll('.branded:is([data-creator-shell], [data-admin-shell])', '.branded[data-creator-shell]');
  }
  if (String(path).endsWith('SocratesShell.tsx') && source.includes('data-admin-shell=')) {
    for (const [after, before] of [
      ["(!(home || active === 'creator' || active === 'admin') || item.id !== 'menu')", "(!(home || active === 'creator') || item.id !== 'menu')"],
      [" data-admin-shell={active === 'admin' || undefined}", ''],
    ]) {
      assert.equal(source.split(after).length, 2, 'Exact Admin navigation presentation hunk');
      source = source.replace(after, before);
    }
  }
  return source;
}
