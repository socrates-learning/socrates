import { projectAccountSunrise } from './account-sunrise.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Narrow reversible presentation changes; no earlier source hashes are replaced.
const header = [
  "      {mode === 'stats' ? (\n        <SocratesShell variant=\"header\" active=\"stats\" role={role} onHome={handleHomeClick} onCreator={handleCreatorClick} />\n      ) : (\n        <LearnerHeader classPrefix=\"home-v2\" brandHref=\"/\" onHomeClick={handleHomeClick} items={mode === 'dashboard' ? [{ kind: 'link', label: 'Profile', icon: 'account', href: '/profile', className: 'home-v2-nav-item home-v2-profile', accountChevron: false }] : items} />\n      )}\n",
  "      <LearnerHeader classPrefix=\"home-v2\" brandHref=\"/\" onHomeClick={handleHomeClick} items={mode === 'dashboard' ? [{ kind: 'link', label: 'Profile', icon: 'account', href: '/profile', className: 'home-v2-nav-item home-v2-profile', accountChevron: false }] : items} />\n"
];
export function projectStatsSunrise(path, source) {
  source = projectAccountSunrise(path, source);
  const name = String(path);
  if (name.endsWith('/StudyPlanner.tsx') && source.includes(header[0])) {
    assert.equal(source.split(header[0]).length, 2, 'One Stats-only header');
    source = source.replace(...header);
  }
  if (name.endsWith('SocratesShell.tsx')) {
    const marker = " data-stats-shell={active === 'stats' || undefined}";
    if (source.includes(marker)) {
      assert.equal(source.split(marker).length, 2, 'One Stats style marker');
      source = source.replace(marker, '');
    }
  }
  if (name.endsWith('SocratesShell.module.css')) {
    const current = '.branded:is([data-creator-shell], [data-admin-shell], [data-stats-shell])';
    if (source.includes(current)) {
      assert.equal(source.split(current).length, 23, 'Exactly 22 existing shared-header selectors');
      source = source.replaceAll(current, '.branded:is([data-creator-shell], [data-admin-shell])');
    }
  }
  if (name.endsWith('StatsProgress.module.css')) {
    const marker = '\n/* Stats sunrise presentation:', start = source.indexOf(marker);
    if (start >= 0) {
      assert.equal(source.split(marker).length, 2, 'One Stats-only style block');
      assert.equal(createHash('sha256').update(source.slice(start)).digest('hex'), 'f7b39ce65df6a2ead1e8697e05545105ff5b627403990101e53d2aee827580fb', 'Exact scoped Stats presentation');
      source = source.slice(0, start);
    }
  }
  return source;
}
