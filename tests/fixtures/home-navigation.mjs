import { projectAppearance } from './appearance.mjs';
import assert from 'node:assert/strict';

// Exact optional navigation-resumption hunks for the Profile confirmation dialog.
// Existing synchronous guards and every original preservation fingerprint remain intact.
const profileNavigationHunks = [
  [
    "type Guard = (resume?: () => void) => boolean;\ntype ShellContext = { registerGuard: (guard: Guard) => () => void; allowNavigation: Guard };\n",
    "type Guard = () => boolean;\ntype ShellContext = { registerGuard: (guard: Guard) => () => void; allowNavigation: () => boolean };\n"
  ],
  [
    "  const allowNavigation = useCallback((resume?: () => void) => guard.current?.(resume) ?? true, []);\n",
    "  const allowNavigation = useCallback(() => guard.current?.() ?? true, []);\n"
  ],
  [
    "  async function logout(approved = false) {\n    if (actionPending.current || (!approved && !(context?.allowNavigation(() => { void logout(true); }) ?? true))) return;\n",
    "  async function logout() {\n    if (actionPending.current || !(context?.allowNavigation() ?? true)) return;\n"
  ],
  [
    "          const navigate = () => {\n            if (item.id === 'home' && onHome) onHome(event);\n            else if (item.id === 'stats' && onStats) onStats();\n            else { if (item.id === 'creator') onCreator?.(); router.push(item.href); }\n            onComplete?.();\n          };\n          if (!(context?.allowNavigation(navigate) ?? true)) return;\n          navigate();\n",
    "          if (!(context?.allowNavigation() ?? true)) return;\n          if (item.id === 'home' && onHome) onHome(event);\n          else if (item.id === 'stats' && onStats) onStats();\n          else { if (item.id === 'creator') onCreator?.(); router.push(item.href); }\n          onComplete?.();\n"
  ],
  [
    "          const navigate = () => {\n            if (navigation.onHome) navigation.onHome(event);\n            else router.push('/');\n          };\n          if (!(context?.allowNavigation(navigate) ?? true)) return;\n          navigate();\n",
    "          if (!(context?.allowNavigation() ?? true)) return;\n          if (navigation.onHome) navigation.onHome(event);\n          else router.push('/');\n"
  ]
];

// Only the approved Home navigation relocation is excluded from earlier fingerprints.
const hunks = {
  "components/StudyPlanner.tsx": [
    [
      "\n  return (\n    <>\n      <LearnerHeader classPrefix=\"home-v2\" brandHref=\"/\" onHomeClick={handleHomeClick} items={mode === 'dashboard' ? [{ kind: 'link', label: 'Profile', icon: 'account', href: '/account', className: 'home-v2-nav-item home-v2-profile', accountChevron: false }] : items} />\n      <main className={`home-v2-shell${mode === 'stats' ? ` home-v2-shell-stats ${statsStyles.shell}` : ''}`} data-home-dashboard={mode === 'dashboard' ? '' : undefined}>\n        {mode !== 'stats' && (\n          <SocratesShell variant=\"home\" active=\"home\" role={role} onHome={handleHomeClick} onStats={() => openStatsTab('progress')} onLogout={handleLogout} onCreator={handleCreatorClick} />\n        )}\n\n        <section className=\"home-v2-workspace\">\n",
      "\n  return (\n    <>\n      <LearnerHeader classPrefix=\"home-v2\" brandHref=\"/\" onHomeClick={handleHomeClick} items={mode === 'dashboard' ? items.filter(item => item.label !== 'Home') : items} />\n      <main className={`home-v2-shell${mode === 'stats' ? ` home-v2-shell-stats ${statsStyles.shell}` : ''}`} data-home-dashboard={mode === 'dashboard' ? '' : undefined}>\n        {mode !== 'stats' && (\n          <SocratesShell variant=\"home\" active=\"home\" onHome={handleHomeClick} onStats={() => openStatsTab('progress')} onLogout={handleLogout} onCreator={handleCreatorClick} />\n        )}\n\n        <section className=\"home-v2-workspace\">\n"
    ]
  ],
  "components/application-shell/SocratesShell.tsx": [
    [
      "  onLogout?: () => void | Promise<void>;\n};\n\nexport function ApplicationNavigation({ active, role, onHome, onStats, onCreator, onLogout, compact = false, branded = false, home = false, onComplete }: NavigationProps & { compact?: boolean; branded?: boolean; home?: boolean; onComplete?: () => void }) {\n  const context = useContext(Context);\n  const router = useRouter();\n  const [busy, setBusy] = useState(false);\n  const actionPending = useRef(false);\n  const entries = applicationNavigation.filter(item =>\n    (item.kind !== 'link' || !item.adminOnly || role === 'admin') && (!home || item.id !== 'menu'));\n  if (home) {\n    const order = ['home', 'creator', 'stats', 'admin', 'account'];\n    entries.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));\n  }\n  async function logout() {\n    if (actionPending.current || !(context?.allowNavigation() ?? true)) return;\n    actionPending.current = true;\n",
      "  onLogout?: () => void | Promise<void>;\n};\n\nexport function ApplicationNavigation({ active, role, onHome, onStats, onCreator, onLogout, compact = false, branded = false, onComplete }: NavigationProps & { compact?: boolean; branded?: boolean; onComplete?: () => void }) {\n  const context = useContext(Context);\n  const router = useRouter();\n  const [busy, setBusy] = useState(false);\n  const actionPending = useRef(false);\n  async function logout() {\n    if (actionPending.current || !(context?.allowNavigation() ?? true)) return;\n    actionPending.current = true;\n"
    ],
    [
      "    } finally { actionPending.current = false; setBusy(false); }\n  }\n  return <nav className={`${styles.navigation} ${compact ? styles.icons : ''}`} aria-label=\"Socrates workspaces\">\n    <div className={styles.entries}>{entries.map(item => {\n      const content = <><span aria-hidden=\"true\" className={styles.icon}>{branded ? <WorkspaceIcon id={item.id} /> : item.icon}</span><span className={styles.label}>{item.label}</span></>;\n      return item.kind === 'button'\n        ? <button key={item.id} type=\"button\" aria-label={item.label} title={item.label}>{content}</button>\n",
      "    } finally { actionPending.current = false; setBusy(false); }\n  }\n  return <nav className={`${styles.navigation} ${compact ? styles.icons : ''}`} aria-label=\"Socrates workspaces\">\n    <div className={styles.entries}>{applicationNavigation.filter(item => item.kind !== 'link' || !item.adminOnly || role === 'admin').map(item => {\n      const content = <><span aria-hidden=\"true\" className={styles.icon}>{branded ? <WorkspaceIcon id={item.id} /> : item.icon}</span><span className={styles.label}>{item.label}</span></>;\n      return item.kind === 'button'\n        ? <button key={item.id} type=\"button\" aria-label={item.label} title={item.label}>{content}</button>\n"
    ],
    [
      "  return <div className={variant === 'home' ? styles.home : styles.frame}>\n    <aside className={styles.rail}>\n      <button ref={trigger} className={styles.trigger} type=\"button\" aria-label=\"Open workspace navigation\" aria-haspopup=\"dialog\" onClick={() => dialog.current?.showModal()}>\u2630</button>\n      <div className={styles.desktop}><ApplicationNavigation {...navigation} active={active} compact={variant !== 'home'} home={variant === 'home'} /></div>\n    </aside>\n    <dialog ref={dialog} className={styles.drawer} aria-label=\"Workspace navigation\" onClose={() => trigger.current?.focus()}>\n      <button type=\"button\" onClick={close} aria-label=\"Close workspace navigation\">Close</button>\n      <ApplicationNavigation {...navigation} active={active} home={variant === 'home'} onComplete={close} />\n    </dialog>\n    {children && <div className={styles.workspace}>{children}</div>}\n  </div>;\n",
      "  return <div className={variant === 'home' ? styles.home : styles.frame}>\n    <aside className={styles.rail}>\n      <button ref={trigger} className={styles.trigger} type=\"button\" aria-label=\"Open workspace navigation\" aria-haspopup=\"dialog\" onClick={() => dialog.current?.showModal()}>\u2630</button>\n      <div className={styles.desktop}><ApplicationNavigation {...navigation} active={active} compact={variant !== 'home'} /></div>\n    </aside>\n    <dialog ref={dialog} className={styles.drawer} aria-label=\"Workspace navigation\" onClose={() => trigger.current?.focus()}>\n      <button type=\"button\" onClick={close} aria-label=\"Close workspace navigation\">Close</button>\n      <ApplicationNavigation {...navigation} active={active} onComplete={close} />\n    </dialog>\n    {children && <div className={styles.workspace}>{children}</div>}\n  </div>;\n"
    ]
  ],
  "app/home.css": [
    [
      "    margin-bottom: 18px;\n  }\n}\n\n/* Home-only Profile stays in the mountain header when navigation stacks. */\n@media (max-width: 1100px) {\n  .home-v2-profile {\n    position: absolute;\n    top: 46px;\n    right: 20px;\n  }\n}\n",
      "    margin-bottom: 18px;\n  }\n}\n"
    ]
  ]
};

export function projectHomeNavigation(path, source) {
  source = projectAppearance(source);
  if (path === 'components/application-shell/SocratesShell.tsx') {
    for (const [current, released] of profileNavigationHunks) {
      assert.equal(source.split(current).length, 2, 'Exactly one Profile navigation-resumption hunk');
      source = source.replace(current, released);
    }
    const actionSignature = "export function SocratesShell({ children, variant = 'compact', headerAction, ...navigation }: NavigationProps & { children?: ReactNode; variant?: 'home' | 'compact' | 'header'; headerAction?: ReactNode }) {";
    assert.equal(source.split(actionSignature).length, 2, 'Exactly one optional Profile header slot');
    source = source.replace(actionSignature, "export function SocratesShell({ children, variant = 'compact', ...navigation }: NavigationProps & { children?: ReactNode; variant?: 'home' | 'compact' | 'header' }) {");
    assert.equal(source.split('        {headerAction}\n').length, 2, 'Exactly one optional header action');
    source = source.replace('        {headerAction}\n', '');
  }
  if (path === 'components/StudyPlanner.tsx') {
    const profile = "label: 'Profile', icon: 'account', href: '/profile', className: 'home-v2-nav-item home-v2-profile'";
    assert.equal(source.split(profile).length, 2, 'Exactly one dedicated Home Profile destination');
    source = source.replace(profile, profile.replace("href: '/profile'", "href: '/account'"));
  }
  for (const [current, released] of hunks[path] || []) {
    assert.equal(source.split(current).length, 2, `Exactly one approved Home navigation hunk in ${path}`);
    source = source.replace(current, released);
  }
  return source;
}
