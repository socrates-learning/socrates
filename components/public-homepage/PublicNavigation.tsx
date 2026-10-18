'use client';

import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { publicWebsiteNavigation, type PublicWebsitePath } from '@/lib/public-website-routes';
import { GetStartedButton } from './PublicWebsiteActions';
import styles from './PublicHomepage.module.css';

export function PublicBrand({ footer = false }: { footer?: boolean }) {
  return <a className={styles.brand} href="/website" aria-label="Socrates public homepage">
    <Image src="/brand/socrates-mark.png" width={50} height={46} alt="" />
    <span><span className={styles.wordmark}>Socrates</span>{footer && <small>Learn Anywhere. Go Further.</small>}</span>
  </a>;
}

export function PublicFooterNavigation({ currentPage = '/website' }: { currentPage?: PublicWebsitePath }) {
  return <nav aria-label="Footer">{publicWebsiteNavigation.map(item =>
    <a key={item.label} href={item.href} aria-current={item.href === currentPage ? 'page' : undefined}>{item.label}</a>)}</nav>;
}

export default function PublicNavigation({ authenticated = false, currentPage = '/website' }: { authenticated?: boolean; currentPage?: PublicWebsitePath }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() { setOpen(false); }
  return <header className={styles.header} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); close(); trigger.current?.focus();
    }
  }}>
    <div className={styles.headerInner}>
      <PublicBrand />
      <button ref={trigger} type="button" className={styles.menuToggle} aria-controls="public-navigation" aria-expanded={open}
        aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(value => !value)}>
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}<span>Menu</span>
      </button>
      <nav id="public-navigation" aria-label="Public website" className={styles.navigation} data-open={open}>
        <div className={styles.navLinks}>{publicWebsiteNavigation.map(item =>
          <a key={item.label} href={item.href} onClick={close} aria-current={item.href === currentPage ? 'page' : undefined}
            className={item.href === currentPage ? styles.currentLink : undefined}>{item.label}</a>)}</div>
        <div className={styles.navActions}>
          <a className={styles.signIn} href={authenticated ? '/' : '/login'}>{authenticated ? 'Back to App' : 'Sign In'}</a>
          <GetStartedButton className={styles.goldButton}>Get Started</GetStartedButton>
        </div>
      </nav>
    </div>
  </header>;
}
