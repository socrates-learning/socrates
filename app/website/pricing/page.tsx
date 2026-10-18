import type { Metadata } from 'next';
import { BookOpen, Check, HeartHandshake, Info, ShieldCheck } from 'lucide-react';
import PublicInformationPage from '@/components/public-website/PublicInformationPage';
import { GetStartedButton } from '@/components/public-homepage/PublicWebsiteActions';
import shared from '@/components/public-homepage/PublicHomepage.module.css';
import styles from '@/components/public-website/PublicInformationPage.module.css';

export const metadata: Metadata = { title: 'Planned Pricing | Socrates', description: 'Learn about the planned affordable, lifetime-access educational package model. Prices and purchases are not available yet.' };

export default function PricingPage() {
  return <PublicInformationPage currentPage="/website/pricing" eyebrow="Our planned approach to access" title="Learning with a longer horizon." introduction="We are planning affordable educational packages with lifetime access, so learners can keep returning to the subjects that matter to them.">
    <section className={styles.section} aria-labelledby="planned-access">
      <div className={styles.pricingPanel}>
        <div className={styles.pricingMain}><p className={styles.kicker}>Planned model · Not yet on sale</p><h2 id="planned-access">Educational packages.<br />Lifetime access.</h2><p>The intention is to offer access around educational Libraries and subject areas, with a clear explanation of what each package includes.</p><p>Affordability is a goal of this model. Final prices, package contents, and access terms have not been announced.</p></div>
        <div className={styles.pricingDetails}><h3>What to expect before purchasing</h3><ul className={styles.checkList}><li><Check aria-hidden="true" /><span>Published pricing approved by the product owners.</span></li><li><Check aria-hidden="true" /><span>Clear educational scope and included material.</span></li><li><Check aria-hidden="true" /><span>Defined lifetime-access terms and purchase policies.</span></li></ul><GetStartedButton className={shared.goldButton}>Get Started</GetStartedButton><p className={styles.smallPrint}>Coming soon. No checkout, payment, or public registration is available.</p></div>
      </div>
    </section>
    <section className={styles.section} aria-label="Principles for future packages"><div className={styles.cardGrid}>
      <article className={styles.card}><span className={styles.icon}><HeartHandshake aria-hidden="true" /></span><h3>Accessible education</h3><p>Our aim is an affordable way to keep learning, without publishing prices before the model is ready.</p></article>
      <article className={styles.card}><span className={styles.icon}><BookOpen aria-hidden="true" /></span><h3>A clear learning focus</h3><p>Planned packages will describe their educational scope so learners can understand what they are choosing.</p></article>
      <article className={styles.card}><span className={styles.icon}><ShieldCheck aria-hidden="true" /></span><h3>Clear terms first</h3><p>Package availability and lifetime-access terms must be confirmed before any purchase is offered.</p></article>
    </div></section>
    <section className={styles.section} aria-labelledby="pricing-questions"><div className={styles.sectionHeading}><h2 id="pricing-questions">A few things to know.</h2></div><div className={styles.faq}>
      <details><summary>Can I buy a package now?</summary><p>No. Packages are not on sale, and this website does not accept payments. There are no approved public prices to display yet.</p></details>
      <details><summary>What does planned lifetime access include?</summary><p>The intention is ongoing access to a purchased educational package. The exact duration terms, included content, and treatment of future updates still need to be defined and published. No purchase entitlement is offered here.</p></details>
      <details><summary>Can I create an account?</summary><p>Public registration is not available. Existing administrator-provided accounts can use the current Sign In experience.</p></details>
    </div></section>
    <section className={styles.section} aria-labelledby="pricing-status"><div className={styles.notice}><Info size={23} aria-hidden="true" /><div><h2 id="pricing-status">Information, not an offer to purchase</h2><p>This page describes a planned model. Existing accounts and Library access are unchanged.</p></div></div></section>
  </PublicInformationPage>;
}
