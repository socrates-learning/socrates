import type { Metadata } from 'next';
import { ArrowRight, Info, MessageSquare, UserRound } from 'lucide-react';
import PublicInformationPage from '@/components/public-website/PublicInformationPage';
import styles from '@/components/public-website/PublicInformationPage.module.css';

export const metadata: Metadata = { title: 'Contact | Socrates', description: 'Contact and feedback availability for the Socrates public website. Public submissions and message delivery are not open yet.' };

export default function ContactPage() {
  return <PublicInformationPage currentPage="/website/contact" eyebrow="Keep in touch" title="A place for conversation. Soon." introduction="Questions and feedback will help shape Socrates. Our public contact experience is still being prepared, and we are not accepting website submissions yet.">
    <section className={`${styles.section} ${styles.contactLayout}`} aria-labelledby="contact-status">
      <div className={styles.contactWelcome}><span className={styles.icon}><MessageSquare aria-hidden="true" /></span><p className={styles.kicker}>Public contact · Coming soon</p><h2 id="contact-status">Thoughtful feedback deserves a proper home.</h2><p>A public contact channel and Suggestion Box are planned for a later phase. No message form or email-delivery service is connected to this page.</p><p>There is nothing to submit here yet, and this page does not collect or store visitor messages.</p><a className={styles.textLink} href="/website/about">Read about our mission <ArrowRight size={17} aria-hidden="true" /></a></div>
      <div className={styles.contactCards}>
        <article className={styles.card}><span className={styles.icon}><UserRound aria-hidden="true" /></span><h3>Already have a Socrates account?</h3><p>Use Sign In in the navigation above. If you are already signed in, Back to App returns you to the same learning application.</p><p>For account questions, continue using your existing contact with the administrator who provided your access.</p></article>
        <article className={styles.card}><h3>Exploring Socrates for the first time?</h3><p>You can read about the learning experience, existing features, and planned package model. Public registration and purchases are not open.</p><a className={styles.textLink} href="/website/features">Explore the features <ArrowRight size={17} aria-hidden="true" /></a></article>
      </div>
    </section>
    <section className={styles.section} aria-labelledby="contact-availability"><div className={styles.notice}><Info size={23} aria-hidden="true" /><div><h2 id="contact-availability">No public submissions yet</h2><p>The public website is still in development. Contact details will be published when the channel is ready.</p></div></div></section>
  </PublicInformationPage>;
}
