import Image from 'next/image';
import type { ReactNode } from 'react';
import { requireAdminWebsitePreview } from '@/lib/server-website-preview-access';
import type { PublicWebsitePath } from '@/lib/public-website-routes';
import PublicNavigation from '@/components/public-homepage/PublicNavigation';
import PublicFooter from '@/components/public-homepage/PublicFooter';
import { PublicWebsiteActions } from '@/components/public-homepage/PublicWebsiteActions';
import shared from '@/components/public-homepage/PublicHomepage.module.css';
import styles from './PublicInformationPage.module.css';

export default async function PublicInformationPage({ currentPage, eyebrow, title, introduction, children }: {
  currentPage: PublicWebsitePath;
  eyebrow: string;
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  // Every informational page verifies access, even when a layout is reused.
  await requireAdminWebsitePreview();
  return <div className={`${shared.page} ${styles.information}`}>
    <PublicWebsiteActions>
      <a className={shared.skipLink} href="#main-content">Skip to content</a>
      <PublicNavigation authenticated currentPage={currentPage} />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="public-page-title">
          <Image src="/images/socrates-header-mountains.jpg" alt="" fill priority sizes="100vw" className={styles.mountains} />
          <div className={styles.heroShade} />
          <div className={`${shared.container} ${styles.heroContent}`}>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id="public-page-title">{title}</h1>
            <p className={styles.introduction}>{introduction}</p>
          </div>
        </section>
        <div className={`${shared.container} ${styles.content}`}>{children}</div>
      </main>
      <PublicFooter currentPage={currentPage} />
    </PublicWebsiteActions>
  </div>;
}
