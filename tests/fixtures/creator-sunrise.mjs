import assert from 'node:assert/strict';
import { projectAdminPresentation } from './admin-sunrise.mjs';
import { createHash } from 'node:crypto';

// Exact append-only visual exceptions. Historical styles and original reference
// hashes remain authoritative; any additional edit fails this projection.
const blocks = {
  "app/home.css": {
    "marker": "\n/* Approved shared navigation gold:",
    "sha256": "df9d2ccccd414663c674533396489cdc95ed3a3cf4dc6d898424f938c8187bd5"
  },
  "components/application-shell/SocratesShell.module.css": {
    "marker": "\n/* Creator sunrise header:",
    "sha256": "84c709378738b685a6f1ee483177a669164ff6205825b004e954b3c5051a369c"
  },
  "components/CreatorStudioV2Client.module.css": {
    "marker": "\n/* Creator sunrise workspace:",
    "sha256": "b500704043b8f31f86549784c7a004a009e9d9c457e2bace4502c8f62f6b4d39"
  }
};
export function projectCreatorSunriseStyles(path, source) {
  source = projectAdminPresentation(path, source);
  const entry = Object.entries(blocks).find(([name]) => String(path) === name || String(path).endsWith('/' + name));
  if (!entry) return source;
  const { marker, sha256 } = entry[1], start = source.indexOf(marker);
  if (start < 0) return source;
  assert.equal(source.split(marker).length, 2, 'One approved Creator presentation block');
  assert.equal(createHash('sha256').update(source.slice(start)).digest('hex'), sha256, 'Exact approved Creator visual block');
  return source.slice(0, start);
}

// Only the two reviewed navigation presentation edits are projected. The
// handlers, role filtering and draft guards remain protected by their old hash.
const navigationHunks = [
  [
    "(!(home || active === 'creator') || item.id !== 'menu')",
    "(!home || item.id !== 'menu')"
  ],
  [
    "<div className={styles.branded} data-creator-shell={active === 'creator' || undefined}>",
    "<div className={styles.branded}>"
  ]
];
export function projectCreatorNavigation(source) {
  source = projectAdminPresentation('SocratesShell.tsx', source);
  for (const [after, before] of navigationHunks) {
    assert.equal(source.split(after).length, 2, 'Exact Creator navigation presentation hunk');
    source = source.replace(after, before);
  }
  return source;
}
