import assert from 'node:assert/strict';

// Remove only the exact approved Admin-only, new-tab Home link for historical fingerprints.
const addition = "    })}\n      {home && role === 'admin' && <a href=\"/website\" target=\"_blank\" rel=\"noopener noreferrer\" aria-label=\"Visit Website (opens in a new tab)\" title=\"Visit Website (opens in a new tab)\" style={{ fontSize: 14, fontWeight: 600 }}>\n        <span aria-hidden=\"true\" className={styles.icon}>\u2197</span><span className={styles.label}>Visit Website</span>\n      </a>}\n    </div>";
export function projectAdminWebsiteNavigation(source) {
  assert.equal(source.split(addition).length, 2, 'Exactly one approved Admin website link');
  return source.replace(addition, '    })}</div>');
}
