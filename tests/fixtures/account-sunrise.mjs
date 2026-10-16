import { projectProfileSunrise } from './profile-sunrise.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Reverse only the exact Account presentation; all prior logic and MFA lines remain visible.
const replacements = [
  [
    "import { BookOpen, ExternalLink, LockKeyhole, Palette, RefreshCw, UserRound } from 'lucide-react';\nimport { SocratesShell } from '@/components/application-shell/SocratesShell';\n",
    "import Image from 'next/image';\nimport { ArrowLeft, BookOpen, ExternalLink, LockKeyhole, Palette, RefreshCw, UserRound } from 'lucide-react';\n"
  ],
  [
    "      <SocratesShell variant=\"header\" active=\"account\" role={context.role} />\n",
    "      <header className={styles.header}>\n        <Link href=\"/\" className={styles.logo} prefetch={false}><Image src=\"/brand/socrates-logo-dark.png\" alt=\"Socrates \u2014 Learn anything.\" width={270} height={152} priority /></Link>\n        <Link href=\"/\" className={styles.back}><ArrowLeft size={18} aria-hidden=\"true\" />Back to Home</Link>\n      </header>\n"
  ]
];
export function projectAccountSunrise(path, source) {
  source = projectProfileSunrise(path, source);
  const name = String(path);
  if (name.endsWith('app/account/page.tsx')) {
    for (const [current, previous] of replacements) if (source.includes(current)) {
      assert.equal(source.split(current).length, 2, 'One exact Account header replacement');
      source = source.replace(current, previous);
    }
  }
  if (name.endsWith('SocratesShell.tsx')) {
    const marker = " data-account-shell={active === 'account' || undefined}";
    if (source.includes(marker)) {
      assert.equal(source.split(marker).length, 2, 'One Account style marker');
      source = source.replace(marker, '');
    }
  }
  if (name.endsWith('SocratesShell.module.css')) {
    const current = '.branded:is([data-creator-shell], [data-admin-shell], [data-stats-shell], [data-account-shell])';
    if (source.includes(current)) {
      assert.equal(source.split(current).length, 23, 'Exactly 22 existing shared-header selectors');
      source = source.replaceAll(current, '.branded:is([data-creator-shell], [data-admin-shell], [data-stats-shell])');
    }
  }
  if (name.endsWith('AccountSettings.module.css')) {
    const marker = '\n/* Account sunrise presentation:', start = source.indexOf(marker);
    if (start >= 0) {
      assert.equal(source.split(marker).length, 2, 'One Account-only style block');
      assert.equal(createHash('sha256').update(source.slice(start)).digest('hex'), 'c8335f472ff47726eb8d5f5db8fc188de77951991dd75646974148a8c826b2b0', 'Exact scoped Account presentation');
      source = source.slice(0, start);
    }
  }
  return source;
}
