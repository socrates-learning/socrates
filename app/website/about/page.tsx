import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowRight, BookOpen, Brain, Compass, HeartHandshake } from 'lucide-react';
import PublicInformationPage from '@/components/public-website/PublicInformationPage';
import shared from '@/components/public-homepage/PublicHomepage.module.css';
import styles from '@/components/public-website/PublicInformationPage.module.css';

export const metadata: Metadata = { title: 'About | Socrates', description: 'Socrates is built around understanding, retention, accessible education, and learner control.' };

export default function AboutPage() {
  return <PublicInformationPage currentPage="/website/about" eyebrow="The purpose behind Socrates" title="Knowledge worth understanding." introduction="Our mission is to make thoughtful learning more accessible: to help people understand what they study, return to it with purpose, and retain it over time.">
    <section className={`${styles.section} ${styles.twoColumns}`} aria-labelledby="mission-title">
      <div className={styles.missionCopy}><p className={styles.kicker}>Learn · Retain · Achieve</p><h2 id="mission-title">More than getting through the material.</h2><p>Learning can become a race through facts. Socrates is being built around a different aim: connecting ideas, practicing recall, and making room for review.</p><p>The application brings Questions, Concepts, personal content, and study evidence together. Its guidance supports a learner’s decisions without taking control of their goals, Topics, or study balance.</p><p>We want education to remain something you can return to, whether you are preparing for a course or continuing to learn beyond it.</p></div>
      <Image className={styles.missionImage} src="/images/homepage-lifelong-learners.png" width={600} height={400} sizes="(max-width: 700px) 90vw, 45vw" alt="Books, a notebook, and a laptop arranged for independent study." />
    </section>
    <section className={styles.section} aria-labelledby="principles-title"><div className={styles.sectionHeading}><h2 id="principles-title">What guides the work.</h2></div><div className={styles.values}>
      <article className={styles.card}><span className={styles.icon}><BookOpen aria-hidden="true" /></span><h3>Understanding</h3><p>Make space for explanations and connected Concepts, not just the next answer.</p></article>
      <article className={styles.card}><span className={styles.icon}><Brain aria-hidden="true" /></span><h3>Retention</h3><p>Support repeated recall and thoughtful review, using the evidence a learner creates through practice.</p></article>
      <article className={styles.card}><span className={styles.icon}><HeartHandshake aria-hidden="true" /></span><h3>Accessible education</h3><p>Work toward clear, usable learning tools and an affordable access model. These are design commitments, not claims of universal availability.</p></article>
      <article className={styles.card}><span className={styles.icon}><Compass aria-hidden="true" /></span><h3>Learner control</h3><p>Keep study choices with the learner. Recommendations explain their evidence, and progress estimates acknowledge uncertainty.</p></article>
    </div></section>
    <section className={`${styles.section} ${styles.explore}`} aria-labelledby="about-next"><div><h2 id="about-next">See the learning experience.</h2><p>The public website is still in development. Explore the approach behind the existing application.</p></div><a className={shared.goldButton} href="/website/how-it-works">How It Works <ArrowRight size={18} aria-hidden="true" /></a></section>
  </PublicInformationPage>;
}
