import { PublicBrand, PublicFooterNavigation } from './PublicNavigation';
import type { PublicWebsitePath } from '@/lib/public-website-routes';
import styles from './PublicHomepage.module.css';

function SocialMark({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Facebook: 'M14 21v-8h3l.5-4H14V7c0-1 .3-2 2-2h2V1.5C17 1.2 16 1 15 1c-3 0-5 2-5 5v3H7v4h3v8',
    X: 'M4 3h4l12 18h-4L4 3Zm16 0L4 21',
    YouTube: 'M9 8l7 4-7 4V8Zm-5-4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
    Instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm9 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17 6h1',
    LinkedIn: 'M3 9h4v12H3V9Zm0-6h4v3H3V3Zm8 18V9h4v2c1-3 6-3 6 2v8h-4v-7c0-2-2-2-2 0v7h-4Z',
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}


export default function PublicFooter({ currentPage = '/website' }: { currentPage?: PublicWebsitePath }) {
  return <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.footerTop}><PublicBrand footer /><PublicFooterNavigation currentPage={currentPage} />
          <div className={styles.socials} aria-label="Social channels — links not yet available">{['Facebook', 'X', 'YouTube', 'Instagram', 'LinkedIn'].map(label => <span key={label} role="img" aria-label={`${label}: link not available yet`} title={`${label} link not available yet`}><SocialMark name={label} /></span>)}</div>
        </div>
        <div className={styles.footerBottom}><small>© {new Date().getFullYear()} Socrates. All rights reserved.</small><div aria-label="Legal information">{['Privacy', 'Terms', 'Cookies'].map(label => <span key={label} aria-disabled="true" title={`${label} information is not published yet.`}>{label}</span>)}</div></div>
      </div>
    </footer>;
}
