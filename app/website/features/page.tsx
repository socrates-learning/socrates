import type { Metadata } from 'next';
import { ArrowRight, BookOpen, ChartNoAxesCombined, FileText, Info, Layers, Lightbulb, Target, Zap } from 'lucide-react';
import PublicInformationPage from '@/components/public-website/PublicInformationPage';
import shared from '@/components/public-homepage/PublicHomepage.module.css';
import styles from '@/components/public-website/PublicInformationPage.module.css';

export const metadata: Metadata = { title: 'Features | Socrates', description: 'Explore existing Socrates study tools, personal learning features, and progress tracking. See what is available and what remains planned.' };

const learningFeatures = [
  { name: 'Study Mode', icon: BookOpen, description: 'Practice active recall, reveal the Answer, and submit feedback. The learning algorithm uses recorded evidence and your study preferences to guide review.', note: 'Review Questions and full Concepts when available.' },
  { name: 'Cram Mode', icon: Zap, description: 'Use a focused review session when you want to work through selected material. Keep your chosen Topics at the center of the session.', note: 'A separate study mode within the same learning application.' },
  { name: 'Study Goals', icon: Target, description: 'Set named goals, deadlines, and Topics. Track coverage and mastery separately, with completion defined by your chosen objective.', note: 'Overlapping goals share progress; history-based estimates are qualified when evidence is limited.' },
  { name: 'Study Advisor', icon: Lightbulb, description: 'Read concise suggestions based on your recent study evidence, Topic preferences, and goals. Each recommendation explains what was observed and what you could consider.', note: 'Suggestions explain their evidence. Your settings stay under your control.' },
  { name: 'Progress Tracking', icon: ChartNoAxesCombined, description: 'See Topic progress, reviewed and unseen material, and recent Study History in Stats. Revisit your own flagged Questions and Cards through Flagged Review.', note: 'Material shared across Topic branches is counted once in your progress.' },
  { name: 'Personal Notes', icon: FileText, description: 'Keep private reminders, explanations, and mnemonics alongside official Questions. Return to the same note on later encounters or in Flagged Review.', note: 'Notes are separate from official content and remain private to your account.' },
  { name: 'Your Own Content', icon: Layers, description: 'Create and edit your own personal Topics and Cards in Creator Studio. Add material that supports your learning alongside the Libraries you can access.', note: 'Personal content remains subject to ownership and Library permissions; official authoring is reserved for authorized staff.' },
];

export default function FeaturesPage() {
  return <PublicInformationPage currentPage="/website/features" eyebrow="Tools for thoughtful learning" title="Make your practice your own." introduction="From your first recall attempt to a long-term study goal, Socrates brings learning, review, and reflection into one application.">
    <section className={styles.section} aria-labelledby="existing-features">
      <div className={styles.sectionHeading}><p className={styles.kicker}>Existing application features</p><h2 id="existing-features">Built into Socrates today.</h2><p>These capabilities are released in the learning application for existing authorized accounts. The public website is still in development.</p></div>
      <div className={styles.featureGrid}>{learningFeatures.map(({ name, icon: Icon, description, note }) => <article className={styles.card} key={name}><span className={styles.icon}><Icon aria-hidden="true" /></span><h3>{name}</h3><p>{description}</p><p className={styles.featureNote}>{note}</p></article>)}</div>
    </section>
    <section className={styles.section} aria-labelledby="future-features"><div className={styles.notice}><Info aria-hidden="true" size={23} /><div><h2 id="future-features">Planned, not available for public use</h2><p>Public registration, educational package purchases, public contact submissions, and a Suggestion Box are deferred. This website does not provide any of those services yet.</p></div></div></section>
    <section className={`${styles.section} ${styles.explore}`} aria-labelledby="features-next"><div><h2 id="features-next">A simple idea. A deliberate approach.</h2><p>See how these tools fit together in a learning session.</p></div><a className={shared.goldButton} href="/website/how-it-works">How It Works <ArrowRight size={18} aria-hidden="true" /></a></section>
  </PublicInformationPage>;
}
