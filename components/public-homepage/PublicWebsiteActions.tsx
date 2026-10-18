'use client';

import { createContext, useContext, useId, useRef, type ReactNode } from 'react';
import styles from './PublicHomepage.module.css';

const ComingSoonContext = createContext<(trigger: HTMLButtonElement) => void>(() => {});

export function PublicWebsiteActions({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const messageId = useId();

  function openComingSoon(button: HTMLButtonElement) {
    if (!dialog.current || dialog.current.open) return;
    trigger.current = button;
    dialog.current.showModal();
    closeButton.current?.focus();
  }

  return <ComingSoonContext.Provider value={openComingSoon}>
    {children}
    <dialog ref={dialog} className={styles.comingSoonDialog} aria-labelledby={titleId} aria-describedby={messageId}
      onClose={() => trigger.current?.focus()}>
      <h2 id={titleId}>Coming Soon</h2>
      <p id={messageId}>Public registration is coming soon. Socrates currently uses administrator-provided accounts.</p>
      <button ref={closeButton} className={styles.navyButton} type="button" onClick={() => dialog.current?.close()}>Got it</button>
    </dialog>
  </ComingSoonContext.Provider>;
}

export function GetStartedButton({ children, className }: { children: ReactNode; className: string }) {
  const open = useContext(ComingSoonContext);
  return <button className={className} type="button" aria-haspopup="dialog" onClick={event => open(event.currentTarget)}>{children}</button>;
}
