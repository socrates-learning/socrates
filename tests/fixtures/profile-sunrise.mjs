import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// These exact presentation substitutions cannot hide changes to handlers or authorization.
const replacements = [
  [
    "                <div className={styles.formGrid}>\n                  <div><label className={styles.field} htmlFor=\"profile-display-name\">Display Name<input id=\"profile-display-name\" name=\"displayName\" type=\"text\" autoComplete=\"nickname\" maxLength={160} value={displayName} aria-describedby=\"profile-name-hint\" onChange={event => { setDisplayName(event.target.value); setMessage(''); setError(''); }} /></label><p id=\"profile-name-hint\" className={styles.hint}>This is how Socrates will greet you. Up to 80 characters; leave blank to keep your existing greeting.</p></div>\n                  <div><label className={styles.field}>Email Address<input type=\"email\" value={email} readOnly /></label><p className={styles.hint}>Manage your email in Account Security.</p></div>\n                  <div><label className={styles.field}>Username<input name=\"profileUsername\" autoComplete=\"off\" maxLength={30} value={details.username} onChange={event => changeDetail('username', event.target.value)} /></label><p className={styles.hint}>A private profile label. Your sign-in email stays the same.</p></div>\n                  <div><label className={styles.field}>Age <span>(optional)</span><input type=\"number\" min={0} max={120} step={1} value={details.age ?? ''} onChange={event => changeDetail('age', event.target.value === '' ? null : Number(event.target.value))} /></label><p className={styles.hint}>Leave empty if you prefer.</p></div>\n                  <div><label className={styles.field}>Location <span>(optional)</span><input autoComplete=\"off\" placeholder=\"City, state/region, or country\" maxLength={100} value={details.location} onChange={event => changeDetail('location', event.target.value)} /></label><p className={styles.hint}>Optional and private to your account.</p></div>\n",
    "                <div className={styles.formGrid}>\n                  <div><label className={styles.field} htmlFor=\"profile-display-name\">Display Name<input id=\"profile-display-name\" name=\"displayName\" type=\"text\" autoComplete=\"nickname\" maxLength={160} value={displayName} aria-describedby=\"profile-name-hint\" onChange={event => { setDisplayName(event.target.value); setMessage(''); setError(''); }} /></label><p id=\"profile-name-hint\" className={styles.hint}>This is how Socrates will greet you. Up to 80 characters; leave blank to keep your existing greeting.</p></div>\n                  <div><label className={styles.field}>Username<input name=\"profileUsername\" autoComplete=\"off\" maxLength={30} value={details.username} onChange={event => changeDetail('username', event.target.value)} /></label><p className={styles.hint}>A private profile label. Your sign-in email stays the same.</p></div>\n                  <div><label className={styles.field}>Email Address<input type=\"email\" value={email} readOnly /></label><p className={styles.hint}>Manage your email in Account Security.</p></div>\n                  <div><label className={styles.field}>Location <span>(optional)</span><input autoComplete=\"off\" placeholder=\"City, state/region, or country\" maxLength={100} value={details.location} onChange={event => changeDetail('location', event.target.value)} /></label><p className={styles.hint}>Optional and private to your account.</p></div>\n                  <div><label className={styles.field}>Age <span>(optional)</span><input type=\"number\" min={0} max={120} step={1} value={details.age ?? ''} onChange={event => changeDetail('age', event.target.value === '' ? null : Number(event.target.value))} /></label><p className={styles.hint}>Leave empty if you prefer.</p></div>\n"
  ],
  [
    "          <p className={styles.summaryEmail}>{email}</p>\n          {memberSince && <p className={styles.memberSince}>Member since {memberSince}</p>}\n          <fieldset className={styles.photoManagement} disabled={busy || photoLoading} hidden={tab !== 'information'}>\n            <legend className={styles.visuallyHidden}>Profile Picture</legend>\n            <input ref={fileInput} className={styles.visuallyHidden} type=\"file\" accept=\"image/jpeg,image/png,image/webp\" aria-label=\"Upload profile picture\" tabIndex={-1} onChange={event => choosePhoto(event.target.files?.[0])} />\n            <div className={styles.actions}><button type=\"button\" className={styles.secondary} onClick={() => fileInput.current?.click()}>{shownPhoto ? 'Change Photo' : 'Upload Photo'}</button><button type=\"button\" className={styles.remove} disabled={!shownPhoto} onClick={() => { setFile(null); setRemovePhoto(Boolean(savedPhoto)); setMessage(''); setError(''); }}>Remove Photo</button></div>\n            <p className={styles.hint}>JPEG, PNG, or WebP. Up to 3 MB. Images are cropped to a circle.</p>\n          </fieldset>\n",
    "          {memberSince && <p className={styles.memberSince}>Member since {memberSince}</p>}\n"
  ],
  [
    "                <div className={styles.formGrid}>\n                  <div><label className={styles.field} htmlFor=\"profile-display-name\">",
    "                <div className={styles.formGrid}>\n                  <div><span className={styles.label}>Profile Picture</span><div className={styles.photoField}><Avatar url={photoUrl} className={styles.smallAvatar} /><div className={styles.photoControls}>\n                    <input ref={fileInput} className={styles.visuallyHidden} type=\"file\" accept=\"image/jpeg,image/png,image/webp\" aria-label=\"Upload profile picture\" tabIndex={-1} onChange={event => choosePhoto(event.target.files?.[0])} />\n                    <div className={styles.actions}><button type=\"button\" className={styles.secondary} onClick={() => fileInput.current?.click()}>{shownPhoto ? 'Change Photo' : 'Upload Photo'}</button><button type=\"button\" className={styles.remove} disabled={!shownPhoto} onClick={() => { setFile(null); setRemovePhoto(Boolean(savedPhoto)); setMessage(''); setError(''); }}>Remove Photo</button></div>\n                    <p className={styles.hint}>JPEG, PNG, or WebP. Up to 3 MB. Images are cropped to a circle.</p>\n                  </div></div></div>\n                  <div><label className={styles.field} htmlFor=\"profile-display-name\">"
  ],
  [
    "<div className={styles.sectionHeading}><div><h2>Profile Information</h2>",
    "<div className={styles.sectionHeading}><span className={styles.sectionIcon}><UserRound aria-hidden=\"true\" /></span><div><h2>Profile Information</h2>"
  ],
  [
    "}}>{Icon && <Icon aria-hidden=\"true\" />}{label}</button>)}</div>",
    "}}><Icon aria-hidden=\"true\" />{label}</button>)}</div>"
  ],
  [
    "{ id: 'information' as const, label: 'Profile Information', Icon: null },",
    "{ id: 'information' as const, label: 'Profile Information', Icon: UserRound },"
  ]
];
export function projectProfileSunrise(path, source) {
  const name = String(path);
  if (name.endsWith('PersonalProfile.tsx')) {
    for (const [current, previous] of replacements) if (source.includes(current)) {
      assert.equal(source.split(current).length, 2, 'One exact Profile presentation substitution');
      source = source.replace(current, previous);
    }
  }
  if (name.endsWith('SocratesShell.tsx')) {
    const marker = " data-profile-shell={pathname === '/profile' || undefined}";
    if (source.includes(marker)) {
      assert.equal(source.split(marker).length, 2, 'One Profile-only style marker');
      source = source.replace(marker, '');
    }
  }
  if (name.endsWith('SocratesShell.module.css')) {
    const current = '.branded:is([data-creator-shell], [data-admin-shell], [data-stats-shell], [data-account-shell], [data-profile-shell])';
    if (source.includes(current)) {
      assert.equal(source.split(current).length, 23, 'Exactly 22 shared-header selectors');
      source = source.replaceAll(current, '.branded:is([data-creator-shell], [data-admin-shell], [data-stats-shell], [data-account-shell])');
    }
  }
  for (const [file, marker, digest] of [
  [
    "PersonalProfile.module.css",
    "\n/* Profile sunrise presentation:",
    "ab76676f6207be0a5bb41318e2461a552088de6d96a02d78494f3406c3d35a4d"
  ],
  [
    "SocratesShell.module.css",
    "\n/* Profile is in the account area;",
    "cc044d420d58bb58af63d826beaa86743a2e8ce2db6a5359dd0bcb98f3381868"
  ]
]) if (name.endsWith(file)) {
    const start = source.indexOf(marker);
    if (start >= 0) {
      assert.equal(source.split(marker).length, 2, 'One exact scoped presentation block');
      const endMarker = '/* End Profile header presentation. */\n';
      const end = file === 'SocratesShell.module.css' ? source.indexOf(endMarker, start) + endMarker.length : source.length;
      assert.ok(end > start, 'Presentation block end retained');
      assert.equal(createHash('sha256').update(source.slice(start, end)).digest('hex'), digest);
      source = source.slice(0, start) + source.slice(end);
    }
  }
  return source;
}
