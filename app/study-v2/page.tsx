'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { navigateBackOrFallback } from '@/lib/safe-navigation';

type NavIconName =
  | 'home'
  | 'learn'
  | 'study'
  | 'progress'
  | 'creator'
  | 'admin'
  | 'account';

type Feedback = 'up' | 'more' | 'down' | null;

const navItems: Array<{ href?: string; icon: NavIconName; label: string }> = [
  { href: '/', icon: 'home', label: 'Home' },
  { icon: 'learn', label: 'Learn' },
  { icon: 'study', label: 'Study' },
  { icon: 'progress', label: 'Progress' },
  { href: '/creator', icon: 'creator', label: 'Creator Studio' },
  { href: '/admin/users', icon: 'admin', label: 'Admin' },
  { icon: 'account', label: 'Account' },
];

function HeaderIcon({ icon }: { icon: NavIconName }) {
  return (
    <span className="study-v2-nav-icon" aria-hidden="true">
      {icon === 'home' && (
        <svg viewBox="0 0 24 24">
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h5v-6h4v6h5V10" />
        </svg>
      )}
      {icon === 'learn' && (
        <svg viewBox="0 0 24 24">
          <path d="M4 5c3 0 5 .8 8 3v12c-3-2.2-5-3-8-3zM20 5c-3 0-5 .8-8 3v12c3-2.2 5-3 8-3z" />
        </svg>
      )}
      {icon === 'study' && (
        <svg viewBox="0 0 24 24">
          <path d="M3 8l9-4 9 4-9 4z" />
          <path d="M7 10v5c3 2 7 2 10 0v-5" />
        </svg>
      )}
      {icon === 'progress' && (
        <svg viewBox="0 0 24 24">
          <path d="M5 20V9M12 20V4M19 20v-8" />
          <path d="M3 20h18" />
        </svg>
      )}
      {icon === 'creator' && (
        <svg viewBox="0 0 24 24">
          <path d="M4 20l4-1 11-11-3-3L5 16z" />
          <path d="M14 7l3 3" />
        </svg>
      )}
      {icon === 'admin' && (
        <svg viewBox="0 0 24 24">
          <path d="M12 3l8 4v5c0 5-3 8-8 10-5-2-8-5-8-10V7z" />
          <path d="M9 12l2 2 4-5" />
        </svg>
      )}
      {icon === 'account' && (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-5 4-7 8-7s6.5 2 8 7" />
        </svg>
      )}
    </span>
  );
}

function StudyPrototypeHeader() {
  function handleHomeClick() {
    window.dispatchEvent(new Event('socrates-open-deck-dashboard'));
  }

  function handleStudyClick() {
    window.dispatchEvent(new Event('socrates-open-deck-setup'));
  }

  function handleCreatorClick() {
    window.dispatchEvent(new Event('socrates-open-creator-dashboard'));
  }

  return (
    <header className="study-v2-header">
      <Link className="study-v2-brand" href="/" onClick={handleHomeClick}>
        <strong>Socrates</strong>
        <span>Real application foundation · concept-network learning platform</span>
      </Link>

      <nav className="study-v2-nav" aria-label="Socrates prototype navigation">
        {navItems.map((item) => {
          const isStudy = item.icon === 'study';
          const isAccount = item.icon === 'account';
          const className = [
            'study-v2-nav-item',
            isStudy ? 'study-v2-nav-active' : '',
            isAccount ? 'study-v2-nav-account' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const content = (
            <>
              <HeaderIcon icon={item.icon} />
              {item.label}
              {isAccount && <span aria-hidden="true">⌄</span>}
            </>
          );

          if (item.href) {
            return (
              <Link
                className={className}
                href={item.href}
                key={item.label}
                onClick={
                  item.icon === 'home'
                    ? handleHomeClick
                    : item.icon === 'creator'
                      ? handleCreatorClick
                      : undefined
                }
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              className={className}
              disabled={!isStudy && !isAccount}
              key={item.label}
              type="button"
              onClick={isStudy ? handleStudyClick : undefined}
            >
              {content}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function ProgressBar() {
  return (
    <div className="study-v2-progress" aria-label="Study progress">
      <span />
    </div>
  );
}

function BackAndClose() {
  const router = useRouter();

  return (
    <div className="study-v2-card-actions" aria-label="Study card controls">
      <button type="button" onClick={() => navigateBackOrFallback(router)}>
        <span aria-hidden="true">←</span>
        Go Back
      </button>
      <button
        aria-label="Close study mode"
        type="button"
        onClick={() => router.replace('/')}
      >
        ×
      </button>
    </div>
  );
}

function FeedbackIcon({ type }: { type: 'up' | 'more' | 'down' }) {
  if (type === 'more') {
    return <span className="study-v2-more-dots">•••</span>;
  }

  return (
    <svg aria-hidden="true" className="study-v2-feedback-svg" viewBox="0 0 64 64">
      {type === 'up' ? (
        <path d="M23 54h-8c-4 0-7-3-7-7V30c0-4 3-7 7-7h8l8-15c2-4 8-2 8 3v12h10c5 0 8 4 7 9l-3 14c-1 5-5 8-10 8z" />
      ) : (
        <path d="M23 10h-8c-4 0-7 3-7 7v17c0 4 3 7 7 7h8l8 15c2 4 8 2 8-3V41h10c5 0 8-4 7-9l-3-14c-1-5-5-8-10-8z" />
      )}
    </svg>
  );
}

export default function StudyV2Page() {
  const [isAnswerVisible, setIsAnswerVisible] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isCramMode, setIsCramMode] = useState(false);

  return (
    <>
      <StudyPrototypeHeader />
      <main className="study-v2-page">
        <section className="study-v2-shell" aria-label="Study Mode prototype">
          <article
            className="study-v2-question-card"
            aria-label="Question card"
            onClick={() => setIsAnswerVisible(true)}
          >
            <div className="study-v2-card-topline">
              <ProgressBar />
              <BackAndClose />
            </div>

            <h1>
              What is the primary purpose
              <br />
              of isolating a patient with
              <br />
              suspected MRSA?
            </h1>

            <p>Tap to reveal answer</p>
          </article>

          {isAnswerVisible && (
            <article className="study-v2-answer-card" aria-label="Answer card">
              <div className="study-v2-card-topline">
                <ProgressBar />
                <BackAndClose />
              </div>

              <div className="study-v2-answer-body">
                <div className="study-v2-answer-lines">
                  <div className="study-v2-rule" aria-hidden="true" />
                  <p>Answer</p>
                  <p>Answer</p>
                  <p>Answer</p>
                  <div className="study-v2-rule" aria-hidden="true" />
                  <p>Explanation</p>
                </div>

                <div className="study-v2-scroll-indicator" aria-hidden="true">
                  <span />
                </div>
              </div>

              <div className="study-v2-feedback-row">
                {[
                  ['up', 'Thumbs Up'],
                  ['more', 'More'],
                  ['down', 'Thumbs Down'],
                ].map(([type, label]) => (
                  <button
                    className={feedback === type ? 'study-v2-feedback-active' : ''}
                    key={type}
                    type="button"
                    onClick={() => setFeedback(type as Feedback)}
                  >
                    <FeedbackIcon type={type as 'up' | 'more' | 'down'} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </article>
          )}

          <label className="study-v2-cram">
            <input
              checked={isCramMode}
              type="checkbox"
              onChange={() => setIsCramMode((current) => !current)}
            />
            <span>Cram Mode</span>
          </label>
        </section>
      </main>

      <style jsx global>{`
        .study-v2-header {
          align-items: center;
          background: linear-gradient(180deg, #061846, #041238);
          color: #ffffff;
          display: flex;
          gap: 28px;
          justify-content: space-between;
          min-height: 107px;
          padding: 26px 22px 24px;
        }

        .study-v2-brand {
          color: #ffffff;
          display: block;
          min-width: 320px;
        }

        .study-v2-brand strong {
          display: block;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 40px;
          font-weight: 900;
          letter-spacing: -0.055em;
          line-height: 0.95;
        }

        .study-v2-brand span {
          color: #edf4ff;
          display: block;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.03em;
          margin-top: 9px;
        }

        .study-v2-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-v2-nav-item {
          align-items: center;
          background: rgba(6, 24, 70, 0.72);
          border: 1px solid rgba(214, 224, 246, 0.36);
          border-radius: 7px;
          color: #ffffff;
          display: inline-flex;
          font: inherit;
          font-size: 14px;
          font-weight: 800;
          gap: 8px;
          min-height: 54px;
          padding: 13px 14px;
          white-space: nowrap;
        }

        .study-v2-nav-item:disabled {
          cursor: default;
          opacity: 1;
        }

        .study-v2-nav-active,
        .study-v2-nav-account {
          background: #155ee8;
          border-color: #2b71ff;
          box-shadow: 0 12px 26px rgba(21, 94, 232, 0.25);
        }

        .study-v2-nav-icon {
          display: inline-flex;
          height: 22px;
          width: 22px;
        }

        .study-v2-nav-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.1;
          width: 100%;
        }

        .study-v2-page {
          background: #f8fafc;
          min-height: calc(100vh - 107px);
          padding: 50px 24px 58px;
        }

        .study-v2-shell {
          background: #ffffff;
          border: 1px solid #e5eaf2;
          border-radius: 8px;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
          margin: 0 auto;
          max-width: 906px;
          padding: 48px 28px 28px;
        }

        .study-v2-question-card,
        .study-v2-answer-card {
          background: #ffffff;
          border: 1px solid #dbe2ee;
          border-radius: 8px;
          overflow: hidden;
        }

        .study-v2-question-card {
          cursor: pointer;
          min-height: 540px;
          padding: 13px 22px 90px;
        }

        .study-v2-answer-card {
          margin-top: 24px;
          min-height: 620px;
          padding-top: 13px;
        }

        .study-v2-card-topline {
          align-items: center;
          display: grid;
          gap: 38px;
          grid-template-columns: minmax(0, 1fr) auto;
        }

        .study-v2-progress {
          background: #e5e8ee;
          border-radius: 999px;
          height: 13px;
          overflow: hidden;
        }

        .study-v2-progress span {
          background: #0f5ee8;
          border-radius: inherit;
          display: block;
          height: 100%;
          width: 56%;
        }

        .study-v2-card-actions {
          align-items: center;
          color: #06133c;
          display: flex;
          gap: 28px;
        }

        .study-v2-card-actions button {
          align-items: center;
          background: transparent;
          border: 0;
          color: inherit;
          display: inline-flex;
          font: inherit;
          font-size: 23px;
          font-weight: 650;
          gap: 10px;
          padding: 0;
        }

        .study-v2-card-actions button:last-child {
          font-size: 48px;
          font-weight: 300;
          line-height: 0.8;
        }

        .study-v2-question-card h1 {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 43px;
          font-weight: 650;
          letter-spacing: -0.035em;
          line-height: 1.45;
          margin: 108px auto 0;
          max-width: 620px;
          text-align: center;
        }

        .study-v2-question-card p {
          color: #77797e;
          font-size: 25px;
          font-weight: 650;
          margin: 84px 0 0;
          text-align: center;
        }

        .study-v2-answer-card .study-v2-card-topline {
          padding: 0 22px;
        }

        .study-v2-answer-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 84px;
          min-height: 398px;
          padding: 52px 0 0;
        }

        .study-v2-answer-lines {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 31px;
          font-weight: 500;
          justify-self: center;
          letter-spacing: -0.035em;
          line-height: 1.12;
          max-width: 330px;
          text-align: center;
          width: 100%;
        }

        .study-v2-answer-lines p {
          margin: 0 0 26px;
        }

        .study-v2-answer-lines p:nth-of-type(4) {
          margin-top: 42px;
        }

        .study-v2-rule {
          border-top: 2px solid #cfd3da;
          margin: 0 0 30px;
          width: 100%;
        }

        .study-v2-answer-lines .study-v2-rule:last-of-type {
          margin: 10px 0 42px;
        }

        .study-v2-scroll-indicator {
          align-self: center;
          background: #c9ccd2;
          border-radius: 999px;
          height: 300px;
          justify-self: center;
          position: relative;
          width: 6px;
        }

        .study-v2-scroll-indicator::before {
          border: solid #c9ccd2;
          border-width: 0 4px 4px 0;
          content: '';
          height: 11px;
          left: -5px;
          position: absolute;
          top: -2px;
          transform: rotate(-135deg);
          width: 11px;
        }

        .study-v2-scroll-indicator::after {
          background: #0f5ee8;
          border-radius: 999px;
          bottom: -3px;
          content: '';
          height: 15px;
          left: -4px;
          position: absolute;
          width: 15px;
        }

        .study-v2-scroll-indicator span {
          background: #0f5ee8;
          border-radius: 999px;
          display: block;
          height: 108px;
          margin-top: 43px;
          width: 100%;
        }

        .study-v2-feedback-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 174px;
        }

        .study-v2-feedback-row button {
          align-items: center;
          background: transparent;
          border: 0;
          border-right: 1px solid #dbe2ee;
          color: #08143b;
          display: flex;
          flex-direction: column;
          font: inherit;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 24px;
          gap: 18px;
          justify-content: center;
        }

        .study-v2-feedback-row button:last-child {
          border-right: 0;
        }

        .study-v2-feedback-active {
          background: #eff6ff !important;
        }

        .study-v2-feedback-svg {
          fill: none;
          height: 58px;
          stroke: #0f5ee8;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 3;
          width: 58px;
        }

        .study-v2-more-dots {
          color: #0f5ee8;
          font-family: system-ui, sans-serif;
          font-size: 45px;
          font-weight: 900;
          letter-spacing: 0.12em;
          line-height: 0.8;
        }

        .study-v2-cram {
          align-items: center;
          color: #08143b;
          display: flex;
          font-size: 24px;
          gap: 16px;
          justify-content: flex-end;
          margin: 34px 16px 0 0;
        }

        .study-v2-cram input {
          accent-color: #0f5ee8;
          height: 25px;
          width: 25px;
        }

        @media (max-width: 900px) {
          .study-v2-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .study-v2-nav {
            justify-content: flex-start;
          }

          .study-v2-page {
            padding: 24px 14px 36px;
          }

          .study-v2-shell {
            padding: 24px 14px;
          }

          .study-v2-question-card h1 {
            font-size: 33px;
          }

          .study-v2-card-topline {
            gap: 18px;
            grid-template-columns: 1fr;
          }

          .study-v2-card-actions {
            justify-content: flex-end;
          }

          .study-v2-answer-body {
            grid-template-columns: 1fr;
          }

          .study-v2-scroll-indicator {
            display: none;
          }

          .study-v2-feedback-row {
            grid-template-columns: 1fr;
          }

          .study-v2-feedback-row button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 140px;
          }
        }
      `}</style>
    </>
  );
}
