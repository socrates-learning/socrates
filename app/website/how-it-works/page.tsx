import type { Metadata } from 'next';
import Image from 'next/image';
import { ArrowRight, BookOpen, SlidersHorizontal, Target } from 'lucide-react';
import PublicInformationPage from '@/components/public-website/PublicInformationPage';
import { publicApplicationPreviews } from '@/components/public-homepage/public-application-previews';
import shared from '@/components/public-homepage/PublicHomepage.module.css';
import styles from '@/components/public-website/PublicInformationPage.module.css';

export const metadata: Metadata = { title: 'How It Works | Socrates', description: 'Choose your Topics, practice active recall, and use guided review to build understanding with Socrates.' };

const learningSteps = [
  { title: 'Choose what matters to you', description: 'Start with an accessible Library, then choose the Topics and Concepts you want to study. Your selections define your focus; the New ↔ Mastery sliders let you balance new material and review.' },
  { title: 'Recall before you reveal', description: 'Consider the Question and try to recall an answer before revealing it. Read the explanation, review the full Concept when available, and reflect on what you understood.' },
  { title: 'Let your history guide review', description: 'Submit honest feedback on your response. Socrates uses your recorded learning evidence and preferences to guide subsequent Study Questions. You can revisit difficult material as your understanding develops.' },
  { title: 'Watch understanding grow', description: 'Use Stats to see your progress and learning history. Study Goals show coverage and mastery separately, so encountering material once is not confused with mastering it.' },
];

export default function HowItWorksPage() {
  const preview = publicApplicationPreviews.study;
  return <PublicInformationPage currentPage="/website/how-it-works" eyebrow="A purposeful learning experience" title="How Socrates works" introduction="Choose your focus. Recall what you know. Review with intention. Build understanding through practice, one Question at a time.">
    <section className={styles.section} aria-labelledby="learning-cycle">
      <div className={styles.sectionHeading}><p className={styles.kicker}>Your learning, step by step</p><h2 id="learning-cycle">A rhythm you can return to.</h2></div>
      <div className={styles.twoColumns}>
        <ol className={styles.steps}>{learningSteps.map((step, index) => <li key={step.title}><span className={styles.stepNumber} aria-hidden="true">{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>)}</ol>
        <div>
          <figure className={styles.preview}><Image src={preview.src} alt={preview.alt} width={preview.width} height={preview.height} sizes="(max-width: 700px) 90vw, 45vw" /><figcaption>{preview.caption}</figcaption></figure>
          <aside className={styles.previewNote}><h3>Understanding comes before a score.</h3><p>Use explanations and Concept Review to connect ideas. Progress reflects recorded study evidence, not a promise of exam results.</p></aside>
        </div>
      </div>
    </section>
    <section className={styles.section} aria-labelledby="learner-control">
      <div className={styles.sectionHeading}><h2 id="learner-control">Guidance, with you in control.</h2><p>Choose the approach that fits today’s learning.</p></div>
      <div className={styles.cardGrid}>
        <article className={styles.card}><span className={styles.icon}><BookOpen aria-hidden="true" /></span><h3>Study or Cram</h3><p>Use Study Mode for ongoing, algorithm-guided practice. Choose Cram Mode for a focused review session on the material you select.</p></article>
        <article className={styles.card}><span className={styles.icon}><SlidersHorizontal aria-hidden="true" /></span><h3>Set your balance</h3><p>Keep control of your Topics and New ↔ Mastery preferences. Study Advisor offers suggestions; it does not adjust your sliders or selections for you.</p></article>
        <article className={styles.card}><span className={styles.icon}><Target aria-hidden="true" /></span><h3>Give progress a purpose</h3><p>Create a goal for an exam, course, or quiz. Estimates use your actual study history and indicate when there is not enough evidence for a useful prediction.</p></article>
      </div>
    </section>
    <section className={`${styles.section} ${styles.explore}`} aria-labelledby="explore-tools"><div><h2 id="explore-tools">Meet the tools behind your practice.</h2><p>See what is already part of the Socrates learning application.</p></div><a className={shared.goldButton} href="/website/features">Explore Features <ArrowRight size={18} aria-hidden="true" /></a></section>
  </PublicInformationPage>;
}
