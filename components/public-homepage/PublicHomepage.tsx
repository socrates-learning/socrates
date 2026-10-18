import Image from 'next/image';
import { ArrowRight, BookOpen, Brain, ChartNoAxesCombined, CirclePlay, FileText, Layers, SlidersHorizontal, Target, Zap } from 'lucide-react';
import PublicNavigation from './PublicNavigation';
import PublicFooter from './PublicFooter';
import { publicApplicationPreviews } from './public-application-previews';
import { GetStartedButton, PublicWebsiteActions } from './PublicWebsiteActions';
import styles from './PublicHomepage.module.css';

const steps = [
  { title: 'Choose what to study', description: 'Select the Topics and Concepts relevant to your education.', icon: BookOpen },
  { title: 'Learn through active recall', description: 'Review Questions and explanations while Socrates records your progress.', icon: Brain },
  { title: 'Build lasting mastery', description: 'Use personalized review, progress tracking, and study recommendations.', icon: ChartNoAxesCombined },
];
const features = [
  { label: 'Personalized Study', icon: SlidersHorizontal },
  { label: 'Cram Mode', icon: Zap },
  { label: 'Study Goals', icon: Target },
  { label: 'Progress Tracking', icon: ChartNoAxesCombined },
  { label: 'Personal Notes', icon: FileText },
  { label: 'Your Own Content', icon: Layers },
];
const audiences = [
  { title: 'Nursing Students', image: 'homepage-nursing-students.png', description: 'Build a strong foundation and prepare for clinical success.', alt: 'Blue nursing scrubs with a stethoscope' },
  { title: 'Medical Students', image: 'homepage-medical-students.png', description: 'Master complex concepts and retain what matters most.', alt: 'A white medical coat with a stethoscope' },
  { title: 'Lifelong Learners', image: 'homepage-lifelong-learners.png', description: 'Gain knowledge in any subject, at your own pace.', alt: 'Books, a notebook, and a laptop on a study desk' },
];


function GetStarted() {
  return <GetStartedButton className={styles.goldButton}>Get Started <ArrowRight size={18} aria-hidden="true" /></GetStartedButton>;
}

export default function PublicHomepage({ authenticated = false }: { authenticated?: boolean }) {
  return <div className={styles.page} id="home">
    <PublicWebsiteActions>
    <a className={styles.skipLink} href="#main-content">Skip to content</a>
    <PublicNavigation authenticated={authenticated} />
    <main id="main-content">
      <section className={styles.hero} aria-labelledby="public-home-title">
        <Image className={styles.heroImage} src="/images/socrates-header-mountains.jpg" alt="" fill priority sizes="100vw" />
        <div className={styles.heroShade} />
        <div className={`${styles.container} ${styles.heroInner}`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Learn · Retain · Achieve</p>
            <h1 id="public-home-title">Learn Anything.<br /><span>Master</span> What Matters.</h1>
            <p className={styles.heroDescription}>A smarter way to study. An algorithm-driven learning platform designed to help you understand, retain, and apply what you learn.</p>
            <div className={styles.actions}><GetStarted /><a className={styles.outlineButton} href="#how-it-works"><CirclePlay size={18} aria-hidden="true" />Explore Socrates</a></div>
          </div>
          <blockquote className={styles.quote}><p>“Education is the kindling of a flame, not the filling of a vessel.”</p><cite>Often attributed to Socrates</cite></blockquote>
          <p className={styles.heroSignature}>A Higher Way to Learn</p>
        </div>
      </section>

      <section className={styles.how} id="how-it-works" aria-labelledby="how-title">
        <div className={styles.container}>
          <div className={styles.sectionHeading}><h2 id="how-title">How Socrates Works</h2><p>A simple, powerful learning experience.</p></div>
          <ol className={styles.steps}>{steps.map(({ title, description, icon: Icon }, index) => <li key={title}>
            <span className={styles.stepNumber} aria-hidden="true">{index + 1}</span>
            <div><Icon className={styles.stepIcon} strokeWidth={1.5} aria-hidden="true" /><h3>{title}</h3><p>{description}</p></div>
          </li>)}</ol>
        </div>
      </section>

      <section className={styles.tools} aria-labelledby="tools-title">
        <div className={`${styles.container} ${styles.toolsInner}`}>
          <div className={styles.toolsCopy}><h2 id="tools-title">Powerful Tools <br />for Real Learning</h2><p>Socrates combines proven learning strategies with modern technology to help you study more efficiently and remember more.</p><a className={styles.navyButton} href="#features">Explore Features<ArrowRight size={18} aria-hidden="true" /></a></div>
          <div className={styles.showcase} aria-label="Socrates application previews">
            <figure className={styles.dashboardShot}><Image src={publicApplicationPreviews.dashboard.src} alt={publicApplicationPreviews.dashboard.alt} width={publicApplicationPreviews.dashboard.width} height={publicApplicationPreviews.dashboard.height} sizes="(max-width: 700px) 90vw, 60vw" /><figcaption>{publicApplicationPreviews.dashboard.caption}</figcaption></figure>
            <figure className={styles.studyShot}><Image src={publicApplicationPreviews.study.src} alt={publicApplicationPreviews.study.alt} width={publicApplicationPreviews.study.width} height={publicApplicationPreviews.study.height} sizes="(max-width: 700px) 70vw, 32vw" /><figcaption>{publicApplicationPreviews.study.caption}</figcaption></figure>
          </div>
        </div>
      </section>

      <section className={styles.featureStrip} id="features" aria-label="Socrates features"><ul className={styles.container}>{features.map(({ label, icon: Icon }) => <li key={label}><Icon size={31} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></li>)}</ul></section>

      <section className={styles.learners} id="about" aria-labelledby="learners-title">
        <Image className={styles.learnersBackground} src="/images/socrates-header-mountains.jpg" alt="" fill sizes="100vw" />
        <div className={`${styles.container} ${styles.learnersInner}`}>
          <div className={styles.learnersCopy}><h2 id="learners-title">Made for Learners <br />Who Want More</h2><p>Whether you’re in nursing, medicine, or any field that requires deep understanding, Socrates helps you build the knowledge and confidence to succeed.</p><a className={styles.navyButton} href="#how-it-works"><CirclePlay size={17} aria-hidden="true" />See How It Works</a></div>
          <div className={styles.learnerCards}>{audiences.map(audience => <article key={audience.title} className={styles.learnerCard}>
            <Image src={`/images/${audience.image}`} alt={audience.alt} width={600} height={400} sizes="(max-width: 600px) 90vw, (max-width: 1000px) 30vw, 21vw" />
            <div><h3>{audience.title}</h3><p>{audience.description}</p></div>
          </article>)}</div>
        </div>
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <Image className={styles.owlBackground} src="/images/homepage-owl-background.png" alt="" fill sizes="100vw" />
        <div className={styles.closingShade} />
        <div className={`${styles.container} ${styles.closingInner}`}>
          <div className={styles.closingCopy}><p className={styles.eyebrow}>Invest in your future</p><h2 id="closing-title">Ready to start learning smarter?</h2><p>Join Socrates and take the next step toward your goals.</p><div className={styles.actions}><GetStarted /><a className={styles.outlineButton} href={authenticated ? '/' : '/login'}>{authenticated ? 'Back to App' : 'Sign In'}</a></div></div>
          <p className={styles.closingSignature}>Knowledge<br />opens new horizons.</p>
        </div>
      </section>
    </main>

    <PublicFooter />
    </PublicWebsiteActions>
  </div>;
}
