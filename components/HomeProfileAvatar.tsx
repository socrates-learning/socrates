'use client';

import Link from 'next/link';
import { useEffect, useState, type MouseEventHandler } from 'react';
import { supabase } from '@/lib/supabase';
import { profileDisplayName, PROFILE_PHOTO_TYPES } from '@/lib/personal-profile';
import styles from './HomeProfileAvatar.module.css';

export function HomeProfileAvatar({ className, onClick }: {
  className: string; onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  const [initial, setInitial] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;
    let objectUrl: string | null = null;
    function clear() {
      pending?.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      setPhoto(null);
      setInitial('');
    }
    async function refresh() {
      if (disposed) return;
      clear();
      const controller = new AbortController();
      pending = controller;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (controller.signal.aborted || error || !data.user) return;
        const name = profileDisplayName(data.user.user_metadata) || data.user.email?.split('@')[0] || '';
        setInitial(Array.from(name.trim())[0]?.toLocaleUpperCase() || '');
        // The existing endpoint resolves the owner from the authenticated session.
        // Never accept an image URL or user ID from profile metadata.
        const response = await fetch('/api/profile/photo', {
          cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
        });
        const type = response.headers.get('content-type')?.split(';')[0];
        if (controller.signal.aborted || !response.ok || response.redirected || response.status === 204
          || !PROFILE_PHOTO_TYPES.some(allowed => allowed === type)) return;
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPhoto(objectUrl);
      } catch {
        // Missing/expired/unavailable photos keep the accessible initial fallback.
      }
    }
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const revisit = () => { void refresh(); };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      clear();
      // Auth callbacks must return before another Auth request starts.
      if (event !== 'SIGNED_OUT') queueMicrotask(revisit);
    });
    void refresh();
    window.addEventListener('focus', revisit);
    window.addEventListener('pageshow', revisit);
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      pending?.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      subscription.unsubscribe();
      window.removeEventListener('focus', revisit);
      window.removeEventListener('pageshow', revisit);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);

  return <Link href="/profile" prefetch={false} onClick={onClick}
    className={`${className} ${styles.avatar}`} aria-label="Open Profile" title="Open Profile">
    {photo
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={photo} alt="" onError={() => setPhoto(null)} />
      : <span aria-hidden="true">{initial || 'S'}</span>}
  </Link>;
}
