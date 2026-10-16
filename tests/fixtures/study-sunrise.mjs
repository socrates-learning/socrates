import { projectStatsSunrise } from './stats-sunrise.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Only the exact approved presentation hunks are projected. Historical
// candidate references and their behavioral fingerprints remain authoritative.
export function projectStudySunrise(path, source) {
  source = projectStatsSunrise(path, source);
  if (!String(path).endsWith('StudyModeStyles.tsx')) return source;
  const marker = '\n        /* Study sunrise presentation:';
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const ending = '        /* End Study sunrise presentation. */\n';
  const end = source.indexOf(ending, start) + ending.length;
  assert.equal(source.split(marker).length, 2, 'One scoped Study presentation block');
  assert.ok(end > start);
  assert.equal(createHash('sha256').update(source.slice(start, end)).digest('hex'), '4cb439e4dc92b385a955e66e2bcb84c25665b5b6dbf3ae59ee83ac8bdf978625', 'Exact approved Study presentation');
  return source.slice(0, start) + source.slice(end);
}

export function projectHomeHubNavigation(path, source) {
  source = projectStatsSunrise(path, source);
  if (!String(path).endsWith('SocratesShell.tsx')) return source;
  const current = "&& item.id !== 'menu');";
  if (!source.includes(current)) return source;
  assert.equal(source.split(current).length, 2, 'Only the obsolete no-action Menu is omitted');
  source = source.replace(current, "&& (!(home || active === 'creator' || active === 'admin') || item.id !== 'menu'));");
  const button = '<button className={styles.logout} type="button" aria-label="Log Out" title="Log Out" disabled={busy} onClick={() => { void logout(); }}><span aria-hidden="true" className={styles.icon}>{branded ? <WorkspaceIcon id="logout" /> : \'↪\'}</span><span className={styles.label}>Log Out</span></button>';
  assert.equal(source.split('{home && ' + button + '}').length, 2, 'Only Home renders the existing logout control');
  return source.replace('{home && ' + button + '}', button);
}
