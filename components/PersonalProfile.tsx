'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, LockKeyhole, Settings, UserRound } from 'lucide-react';
import { ProfileSecurity } from '@/components/ProfileSecurity';
import { useRouter } from 'next/navigation';
import { SocratesShell, useSocratesNavigationGuard } from '@/components/application-shell/SocratesShell';
import { EMPTY_PERSONAL_DETAILS, PROFILE_LANGUAGES, normalizeDisplayName, normalizePersonalDetails, validateProfilePhoto, type PersonalDetails } from '@/lib/personal-profile';
import styles from './PersonalProfile.module.css';

async function profileRequest(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error' });
  const type = response.headers.get('content-type')?.split(';')[0];
  const photoRead = url === '/api/profile/photo' && !init.method;
  // Authentication middleware may redirect an expired session. An HTML login
  // page is never an acknowledgement that profile data was read or saved.
  if (response.redirected || (response.ok && !(photoRead
    ? response.status === 204 || ['image/jpeg', 'image/png', 'image/webp'].includes(type || '')
    : type === 'application/json'))) throw new Error('Your session could not be verified. Please sign in again and retry.');
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || 'Your changes could not be saved. Please try again.');
  }
  return response;
}

function Avatar({ url, className }: { url: string | null; className: string }) {
  return <div className={className}>
    {url
      // A private blob, never a public or metadata-provided URL.
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={url} alt="Your profile photo" />
      : <UserRound aria-label="Default profile picture" role="img" strokeWidth={1.4} />}
  </div>;
}

export function PersonalProfile({ initialTab = 'information', email, initialDisplayName, initialDetails = EMPTY_PERSONAL_DETAILS, memberSince = '', timeZones = ['UTC'], role }: {
  initialTab?: 'information' | 'security'; email: string; initialDisplayName: string; initialDetails?: PersonalDetails; memberSince?: string; timeZones?: string[]; role: 'admin' | 'editor' | 'learner';
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'information' | 'security' | 'preferences'>(initialTab);
  const [details, setDetails] = useState(initialDetails);
  const [savedDetails, setSavedDetails] = useState(initialDetails);
  const [securityDirty, setSecurityDirty] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const securityState = useCallback((dirty: boolean, pending: boolean) => { setSecurityDirty(dirty); setSecurityBusy(pending); }, []);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const leaving = useRef(false);
  const [savedName, setSavedName] = useState(initialDisplayName);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [savedPhoto, setSavedPhoto] = useState<Blob | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(true);
  const [photoError, setPhotoError] = useState('');
  const [photoRetry, setPhotoRetry] = useState(0);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const saving = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const detailsDirty = JSON.stringify(details) !== JSON.stringify(savedDetails);
  const profileDirty = displayName !== savedName || detailsDirty || Boolean(file) || removePhoto;
  const dirty = profileDirty || securityDirty;
  const mayLeave = useCallback(() => {
    if (saving.current || securityBusy) return false;
    if (dirty && !window.confirm('Discard your unsaved profile changes?')) return false;
    leaving.current = true; return true;
  }, [dirty, securityBusy]);
  useSocratesNavigationGuard(mayLeave);

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (!leaving.current && (dirty || saving.current || securityBusy)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty, securityBusy]);

  useEffect(() => {
    const controller = new AbortController();
    setPhotoLoading(true);
    setPhotoError('');
    void (async () => {
      try {
        const response = await profileRequest('/api/profile/photo', { signal: controller.signal });
        const photo = response.status === 204 ? null : await response.blob();
        if (!controller.signal.aborted) setSavedPhoto(photo);
      } catch (cause) {
        if (!controller.signal.aborted) setPhotoError(cause instanceof Error ? cause.message : 'Your photo could not be loaded.');
      } finally { if (!controller.signal.aborted) setPhotoLoading(false); }
    })();
    return () => controller.abort();
  }, [photoRetry]);

  const shownPhoto = removePhoto ? null : file || savedPhoto;
  useEffect(() => {
    const url = shownPhoto ? URL.createObjectURL(shownPhoto) : null;
    setPhotoUrl(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [shownPhoto]);

  function choosePhoto(next: File | undefined) {
    setMessage(''); setError('');
    if (!next) return;
    try { validateProfilePhoto(next); setFile(next); setRemovePhoto(false); }
    catch (cause) { setError((cause as Error).message); }
    if (fileInput.current) fileInput.current.value = '';
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    setError(''); setMessage('');
    let name: string; let normalizedDetails: PersonalDetails;
    try { name = normalizeDisplayName(displayName); normalizedDetails = normalizePersonalDetails(details); if (file) validateProfilePhoto(file); }
    catch (cause) { setError((cause as Error).message); return; }
    saving.current = true; setBusy(true);
    let nameSaved = false;
    let refreshRequired = false;
    try {
      if (name !== savedName || detailsDirty) {
        const response = await profileRequest('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: name, ...(detailsDirty ? { details: normalizedDetails } : {}) }) });
        const result = await response.json();
        setSavedName(result.displayName); setDisplayName(result.displayName);
        if (detailsDirty) { setSavedDetails(result.details || normalizedDetails); setDetails(result.details || normalizedDetails); }
        nameSaved = true; refreshRequired = result.refreshRequired;
        router.refresh();
      } else { setDisplayName(name); }
      if (file) {
        await profileRequest('/api/profile/photo', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        setSavedPhoto(file); setFile(null); setPhotoError('');
      } else if (removePhoto) {
        await profileRequest('/api/profile/photo', { method: 'DELETE' });
        setSavedPhoto(null); setRemovePhoto(false); setPhotoError('');
      }
      setMessage(refreshRequired ? 'Changes saved. Sign in again to refresh your Home greeting.' : 'Changes saved.');
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'Please try again.';
      setError(nameSaved ? `Your display name was saved. ${detail}` : detail);
    } finally { saving.current = false; setBusy(false); }
  }

  function changeDetail<K extends keyof PersonalDetails>(key: K, value: PersonalDetails[K]) {
    setDetails(current => ({ ...current, [key]: value })); setMessage(''); setError('');
  }
  function discard() {
    setDisplayName(savedName); setDetails(savedDetails); setFile(null); setRemovePhoto(false); setMessage(''); setError('');
  }
  const tabs = [
    { id: 'information' as const, label: 'Profile Information', Icon: UserRound },
    { id: 'security' as const, label: 'Account Security', Icon: LockKeyhole },
    { id: 'preferences' as const, label: 'Preferences', Icon: Settings },
  ];
  return <div className={styles.shell}><SocratesShell variant="header" role={role} onHome={() => { window.location.assign('/'); }} headerAction={<button type="button" className={styles.backHome} onClick={() => { if (mayLeave()) window.location.assign('/'); }}><ArrowLeft aria-hidden="true" />Back to Home</button>}>
    <main className={styles.page}>
      <div className={styles.heading}><h1>Profile</h1><p>Manage your personal information and account settings.</p></div>
      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.summary}`} aria-label="Profile summary">
          <div className={styles.avatarWrap}><Avatar url={photoUrl} className={styles.avatar} /><button type="button" aria-label="Change profile photo" className={styles.camera} disabled={busy || photoLoading} onClick={() => { setTab('information'); fileInput.current?.click(); }}><Camera aria-hidden="true" /></button></div>
          <h2>{savedName || 'Your profile'}</h2>
          <p className={styles.username}>{savedDetails.username ? `@${savedDetails.username}` : 'Username not set'}</p>
          {memberSince && <p className={styles.memberSince}>Member since {memberSince}</p>}
          <blockquote className={styles.quote}>“A disciplined mind leads to a brighter tomorrow.”<span>A DAILY REMINDER</span></blockquote>
        </section>
        <section className={`${styles.panel} ${styles.editor}`} aria-label="Profile settings">
          <div className={styles.tabs} role="tablist" aria-label="Profile settings">{tabs.map(({ id, label, Icon }, index) => <button key={id} ref={element => { tabRefs.current[index] = element; }} id={`profile-tab-${id}`} role="tab" type="button" aria-selected={tab === id} aria-controls={`profile-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
            let next = index;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            else return;
            event.preventDefault(); setTab(tabs[next].id); tabRefs.current[next]?.focus();
          }}><Icon aria-hidden="true" />{label}</button>)}</div>
          <form hidden={tab === 'security'} noValidate onSubmit={event => { void save(event); }} aria-busy={busy}>
            <fieldset disabled={busy || photoLoading} className={styles.fields}>
              <legend className={styles.visuallyHidden}>Profile details</legend>
              <div id="profile-panel-information" role="tabpanel" aria-labelledby="profile-tab-information" hidden={tab !== 'information'}>
                <div className={styles.sectionHeading}><span className={styles.sectionIcon}><UserRound aria-hidden="true" /></span><div><h2>Profile Information</h2><p>Update your personal information and how you appear on Socrates.</p></div></div>
                <div className={styles.formGrid}>
                  <div><span className={styles.label}>Profile Picture</span><div className={styles.photoField}><Avatar url={photoUrl} className={styles.smallAvatar} /><div className={styles.photoControls}>
                    <input ref={fileInput} className={styles.visuallyHidden} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile picture" tabIndex={-1} onChange={event => choosePhoto(event.target.files?.[0])} />
                    <div className={styles.actions}><button type="button" className={styles.secondary} onClick={() => fileInput.current?.click()}>{shownPhoto ? 'Change Photo' : 'Upload Photo'}</button><button type="button" className={styles.remove} disabled={!shownPhoto} onClick={() => { setFile(null); setRemovePhoto(Boolean(savedPhoto)); setMessage(''); setError(''); }}>Remove Photo</button></div>
                    <p className={styles.hint}>JPEG, PNG, or WebP. Up to 3 MB. Images are cropped to a circle.</p>
                  </div></div></div>
                  <div><label className={styles.field} htmlFor="profile-display-name">Display Name<input id="profile-display-name" name="displayName" type="text" autoComplete="nickname" maxLength={160} value={displayName} aria-describedby="profile-name-hint" onChange={event => { setDisplayName(event.target.value); setMessage(''); setError(''); }} /></label><p id="profile-name-hint" className={styles.hint}>This is how Socrates will greet you. Up to 80 characters; leave blank to keep your existing greeting.</p></div>
                  <div><label className={styles.field}>Username<input name="profileUsername" autoComplete="off" maxLength={30} value={details.username} onChange={event => changeDetail('username', event.target.value)} /></label><p className={styles.hint}>A private profile label. Your sign-in email stays the same.</p></div>
                  <div><label className={styles.field}>Email Address<input type="email" value={email} readOnly /></label><p className={styles.hint}>Manage your email in Account Security.</p></div>
                  <div><label className={styles.field}>Location <span>(optional)</span><input autoComplete="off" placeholder="City, state/region, or country" maxLength={100} value={details.location} onChange={event => changeDetail('location', event.target.value)} /></label><p className={styles.hint}>Optional and private to your account.</p></div>
                  <div><label className={styles.field}>Age <span>(optional)</span><input type="number" min={0} max={120} step={1} value={details.age ?? ''} onChange={event => changeDetail('age', event.target.value === '' ? null : Number(event.target.value))} /></label><p className={styles.hint}>Leave empty if you prefer.</p></div>
                </div>
                {photoLoading && <p role="status" className={styles.hint}>Loading your photo…</p>}
                {photoError && <div role="alert" className={styles.error}>{photoError} <button className={styles.secondary} type="button" onClick={() => setPhotoRetry(value => value + 1)}>Retry</button></div>}
              </div>
              <div id="profile-panel-preferences" role="tabpanel" aria-labelledby="profile-tab-preferences" hidden={tab !== 'preferences'}>
                <div className={styles.sectionHeading}><span className={styles.sectionIcon}><Settings aria-hidden="true" /></span><div><h2>Preferences</h2><p>Your personal language and time-zone preferences.</p></div></div>
                <div className={styles.formGrid}>
                  <div><label className={styles.field}>Preferred Language <span>(optional)</span><select value={details.language} onChange={event => changeDetail('language', event.target.value)}><option value="">Not set</option>{PROFILE_LANGUAGES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><p className={styles.hint}>Saved as a preference. Socrates currently uses English.</p></div>
                  <div><label className={styles.field}>Time Zone <span>(optional)</span><select value={details.timeZone} onChange={event => changeDetail('timeZone', event.target.value)}><option value="">Not set</option>{[...new Set([...timeZones, ...(details.timeZone ? [details.timeZone] : [])])].map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}</select></label><p className={styles.hint}>Saved privately. Existing study times and deadlines are unchanged.</p></div>
                </div>
              </div>
              <div className={styles.saveRow}><button type="button" className={styles.secondary} disabled={!profileDirty} onClick={discard}>Discard Changes</button><button type="submit" className={styles.primary} disabled={!profileDirty}>{busy ? 'Saving…' : 'Save Changes'}</button></div>
            </fieldset>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            {message && <p role="status" className={styles.success}>{message}</p>}
          </form>
          <div id="profile-panel-security" role="tabpanel" aria-labelledby="profile-tab-security" hidden={tab !== 'security'}><ProfileSecurity email={email} onState={securityState} /></div>
        </section>
      </div>
    </main>
  </SocratesShell></div>;
}
