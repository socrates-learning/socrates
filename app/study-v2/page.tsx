'use client';

import Link from 'next/link';
import Image from 'next/image';
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
type CardFeedbackType = 'error' | 'suggestion';
type Response =
  | 'easy'
  | 'average'
  | 'hard'
  | 'didnt_know'
  | 'forgot'
  | 'too_hard'
  | null;

const navItems: Array<{ href?: string; icon: NavIconName; label: string }> = [
  { href: '/', icon: 'home', label: 'Home' },
  { icon: 'learn', label: 'Learn' },
  { icon: 'study', label: 'Study' },
  { icon: 'progress', label: 'Progress' },
  { href: '/creator/concepts/new', icon: 'creator', label: 'Creator Studio' },
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
        <Image
          alt="Socrates owl mark"
          className="study-v2-brand-mark"
          height={66}
          src="/brand/socrates-mark.png"
          width={76}
        />
        <div>
          <strong>Socrates</strong>
          <span>Learn anything.</span>
        </div>
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
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [response, setResponse] = useState<Response>(null);
  const [cardFeedbackType, setCardFeedbackType] =
    useState<CardFeedbackType | null>(null);
  const [cardFeedbackMessage, setCardFeedbackMessage] = useState('');
  const [isCramMode, setIsCramMode] = useState(false);

  return (
    <>
      <StudyPrototypeHeader />
      <main className="study-v2-page">
        <section className="study-v2-shell" aria-label="Study Mode prototype">
          <article
            aria-label={isAnswerVisible ? 'Revealed study card' : 'Question card'}
            className={`study-v2-card ${
              isAnswerVisible ? 'study-v2-card-revealed' : 'study-v2-card-front'
            }`}
            onClick={
              isAnswerVisible ? undefined : () => setIsAnswerVisible(true)
            }
            onKeyDown={(event) => {
              if (
                !isAnswerVisible &&
                (event.key === 'Enter' || event.key === ' ')
              ) {
                event.preventDefault();
                setIsAnswerVisible(true);
              }
            }}
            role={isAnswerVisible ? undefined : 'button'}
            tabIndex={isAnswerVisible ? undefined : 0}
          >
            <div className="study-v2-card-topline">
              <ProgressBar />
              <BackAndClose />
            </div>

            {!isAnswerVisible ? (
              <div className="study-v2-question-content">
                <h1>
                  What is the primary purpose
                  <br />
                  of isolating a patient with
                  <br />
                  suspected MRSA?
                </h1>
                <p>Tap to reveal answer</p>
              </div>
            ) : (
              <>
                <div className="study-v2-answer-body">
                  <section
                    className="study-v2-answer-section"
                    aria-labelledby="prototype-answer-heading"
                  >
                    <h1 id="prototype-answer-heading">Answer</h1>
                    <p>Answer</p>
                  </section>
                  <section
                    className="study-v2-explanation-section"
                    aria-labelledby="prototype-explanation-heading"
                  >
                    <h2 id="prototype-explanation-heading">Explanation</h2>
                    <p>Explanation</p>
                  </section>
                </div>

                {feedback === null ? (
                  <div className="study-v2-feedback-row">
                    {[
                      ['up', 'Thumbs Up'],
                      ['more', 'More'],
                      ['down', 'Thumbs Down'],
                    ].map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setFeedback(type as Feedback);
                          setResponse(null);
                          setCardFeedbackType(null);
                          setCardFeedbackMessage('');
                        }}
                      >
                        <FeedbackIcon type={type as 'up' | 'more' | 'down'} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                ) : feedback === 'more' ? (
                  <div className="study-v2-more-panel">
                    {cardFeedbackType === null ? (
                      <div className="study-v2-more-choice-row">
                        <button
                          type="button"
                          onClick={() => setCardFeedbackType('error')}
                        >
                          Report an error
                        </button>
                        <button
                          type="button"
                          onClick={() => setCardFeedbackType('suggestion')}
                        >
                          Suggest an improvement
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFeedback(null);
                            setResponse(null);
                          }}
                        >
                          ← Back
                        </button>
                      </div>
                    ) : (
                      <form
                        className="study-v2-more-form"
                        onSubmit={(event) => event.preventDefault()}
                      >
                        <label>
                          <span>
                            {cardFeedbackType === 'error'
                              ? 'What looks incorrect or misleading?'
                              : 'How could this question or answer be improved?'}
                          </span>
                          <textarea
                            autoFocus
                            maxLength={4000}
                            placeholder="Share a concise note"
                            value={cardFeedbackMessage}
                            onChange={(event) =>
                              setCardFeedbackMessage(event.target.value)
                            }
                          />
                        </label>
                        <div className="study-v2-more-form-footer">
                          <p>Demo card — feedback is not sent.</p>
                          <button
                            type="button"
                            onClick={() => {
                              setCardFeedbackType(null);
                              setCardFeedbackMessage('');
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="study-v2-more-submit"
                            disabled
                            type="submit"
                          >
                            Submit
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <div className="study-v2-response-stage">
                    <div className="study-v2-response-toolbar">
                      <button
                        className="study-v2-response-back"
                        type="button"
                        onClick={() => {
                          setFeedback(null);
                          setResponse(null);
                        }}
                      >
                        ← Back
                      </button>
                    </div>
                    <div className="study-v2-rating-row">
                      {(feedback === 'up'
                        ? [
                            ['easy', 'Easy', 'I knew this well'],
                            ['average', 'Average', 'I knew part of this'],
                            ['hard', 'Hard', 'This was challenging'],
                          ]
                        : [
                            ['didnt_know', "Didn't Know", 'I had no idea'],
                            [
                              'forgot',
                              'Forgot / Got It Wrong',
                              'I knew it before but missed it',
                            ],
                            ['too_hard', 'Too Hard', 'This was above my level'],
                          ]
                      ).map(([value, label, subtitle]) => (
                        <button
                          aria-pressed={response === value}
                          className={`study-v2-rating-button study-v2-rating-${value}${
                            response === value ? ' study-v2-rating-active' : ''
                          }`}
                          key={value}
                          type="button"
                          onClick={() => setResponse(value as Response)}
                        >
                          <strong>{label}</strong>
                          <span>{subtitle}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </article>

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
          align-items: center;
          color: #ffffff;
          display: flex;
          gap: 12px;
          min-width: 320px;
        }

        .study-v2-brand-mark {
          flex: 0 0 auto;
          height: 66px;
          object-fit: contain;
          width: 76px;
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
          padding: 28px 24px;
        }

        .study-v2-shell {
          background: #ffffff;
          border: 1px solid #e5eaf2;
          border-radius: 8px;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
          margin: 0 auto;
          max-width: 906px;
          padding: 24px 28px;
        }

        .study-v2-card {
          background: #ffffff;
          border: 1px solid #dbe2ee;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          height: clamp(480px, calc(100vh - 290px), 640px);
          overflow: hidden;
          padding-top: 13px;
          transition:
            border-color 200ms ease,
            box-shadow 200ms ease;
        }

        .study-v2-card-front {
          cursor: pointer;
        }

        .study-v2-card-front:focus-visible {
          border-color: #0f5ee8;
          box-shadow: 0 0 0 3px rgba(15, 94, 232, 0.2);
          outline: 0;
        }

        .study-v2-card-topline {
          align-items: center;
          display: grid;
          gap: 38px;
          grid-template-columns: minmax(0, 1fr) auto;
          flex: 0 0 auto;
          padding: 0 22px;
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

        .study-v2-question-content {
          animation: study-v2-content-in 200ms ease-out;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: center;
          padding: 24px 22px 64px;
        }

        .study-v2-question-content h1 {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 43px;
          font-weight: 650;
          letter-spacing: -0.035em;
          line-height: 1.45;
          margin: auto auto 0;
          max-width: 620px;
          text-align: center;
        }

        .study-v2-question-content > p {
          color: #77797e;
          font-size: 25px;
          font-weight: 650;
          margin: auto 0 0;
          text-align: center;
        }

        @keyframes study-v2-content-in {
          from {
            opacity: 0;
            transform: translateY(4px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .study-v2-answer-body {
          animation: study-v2-content-in 200ms ease-out;
          color: #08143b;
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 28px clamp(28px, 8vw, 88px) 32px;
          scrollbar-gutter: stable;
        }

        .study-v2-answer-section,
        .study-v2-explanation-section {
          margin: 0 auto;
          max-width: 680px;
        }

        .study-v2-answer-section h1,
        .study-v2-explanation-section h2 {
          font-family: Georgia, "Times New Roman", Times, serif;
          letter-spacing: -0.035em;
          margin: 0 0 14px;
        }

        .study-v2-answer-section h1 {
          color: #0f5ee8;
          font-size: 24px;
          font-weight: 750;
        }

        .study-v2-answer-section p {
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: clamp(25px, 3vw, 34px);
          font-weight: 600;
          letter-spacing: -0.025em;
          line-height: 1.3;
          margin: 0;
        }

        .study-v2-explanation-section {
          border-top: 1px solid #dbe2ee;
          margin-top: 28px;
          padding-top: 24px;
        }

        .study-v2-explanation-section h2 {
          font-size: 21px;
          font-weight: 700;
        }

        .study-v2-explanation-section p {
          color: #334155;
          font-size: 18px;
          line-height: 1.65;
          margin: 0;
        }

        .study-v2-feedback-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          flex: 0 0 auto;
          grid-template-columns: repeat(3, 1fr);
          min-height: 148px;
        }

        .study-v2-feedback-row button {
          align-items: center;
          background: transparent;
          border: 0;
          border-right: 1px solid #dbe2ee;
          color: #08143b;
          cursor: pointer;
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

        .study-v2-more-panel {
          background: #f8fafc;
          border-top: 1px solid #dbe2ee;
          flex: 0 0 auto;
          max-height: 270px;
          overflow-y: auto;
        }

        .study-v2-more-choice-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 96px;
        }

        .study-v2-more-choice-row button {
          background: #ffffff;
          border: 0;
          border-right: 1px solid #dbe2ee;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 750;
          padding: 18px;
        }

        .study-v2-more-choice-row button:last-child {
          border-right: 0;
        }

        .study-v2-more-form {
          display: grid;
          gap: 10px;
          padding: 14px 18px 16px;
        }

        .study-v2-more-form label {
          color: #08143b;
          display: grid;
          font-size: 15px;
          font-weight: 700;
          gap: 7px;
        }

        .study-v2-more-form textarea {
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          color: #0f172a;
          font: inherit;
          line-height: 1.4;
          min-height: 76px;
          padding: 9px 11px;
          resize: vertical;
          width: 100%;
        }

        .study-v2-more-form textarea:focus {
          border-color: #0f5ee8;
          box-shadow: 0 0 0 3px rgba(15, 94, 232, 0.14);
          outline: 0;
        }

        .study-v2-more-form-footer {
          align-items: center;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-v2-more-form-footer p {
          color: #475569;
          flex: 1;
          font-size: 14px;
          margin: 0;
        }

        .study-v2-more-form-footer button {
          background: #ffffff;
          border: 1px solid #b8c4d6;
          border-radius: 7px;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 750;
          min-height: 38px;
          padding: 8px 14px;
        }

        .study-v2-more-form-footer button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .study-v2-more-form-footer .study-v2-more-submit {
          background: #0f5ee8;
          border-color: #0f5ee8;
          color: #ffffff;
        }

        .study-v2-response-toolbar {
          align-items: center;
          border-top: 1px solid #dbe2ee;
          display: flex;
          flex: 0 0 auto;
          gap: 18px;
          min-height: 64px;
          padding: 12px 20px;
        }

        .study-v2-response-toolbar p {
          color: #475569;
          flex: 1;
          margin: 0;
          text-align: center;
        }

        .study-v2-response-back {
          background: transparent;
          border: 0;
          color: #0f5ee8;
          cursor: pointer;
          font: inherit;
          font-weight: 700;
        }

        .study-v2-rating-row {
          border-top: 1px solid #dbe2ee;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          min-height: 148px;
        }

        .study-v2-rating-button {
          align-items: center;
          border: 0;
          border-right: 1px solid #dbe2ee;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          font: inherit;
          font-family: Georgia, "Times New Roman", Times, serif;
          gap: 12px;
          justify-content: center;
          padding: 24px;
        }

        .study-v2-rating-button:last-child {
          border-right: 0;
        }

        .study-v2-rating-button strong {
          font-size: 26px;
        }

        .study-v2-rating-button span {
          color: #334155;
          font-family: system-ui, sans-serif;
          font-size: 16px;
          font-weight: 600;
        }

        .study-v2-rating-easy {
          background: #f0fdf4;
          color: #2f8f46;
        }

        .study-v2-rating-average {
          background: #fffbeb;
          color: #9a6c00;
        }

        .study-v2-rating-hard {
          background: #fff7ed;
          color: #e3642a;
        }

        .study-v2-rating-didnt_know {
          background: #fff1f2;
          color: #be123c;
        }

        .study-v2-rating-forgot {
          background: #fff7ed;
          color: #c2410c;
        }

        .study-v2-rating-too_hard {
          background: #fef2f2;
          color: #b91c1c;
        }

        .study-v2-rating-active {
          box-shadow: inset 0 0 0 3px currentColor;
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

          .study-v2-brand-mark {
            height: 48px;
            width: 55px;
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

          .study-v2-card {
            height: min(620px, 72dvh);
            min-height: 500px;
          }

          .study-v2-question-content h1 {
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
            padding: 24px 22px 28px;
          }

          .study-v2-feedback-row {
            grid-template-columns: 1fr;
          }

          .study-v2-feedback-row button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 140px;
          }

          .study-v2-more-choice-row {
            grid-template-columns: 1fr;
          }

          .study-v2-more-choice-row button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 52px;
            padding: 12px 16px;
          }

          .study-v2-more-choice-row button:last-child {
            border-bottom: 0;
          }

          .study-v2-more-form-footer {
            flex-wrap: wrap;
          }

          .study-v2-more-form-footer p {
            flex-basis: 100%;
          }

          .study-v2-rating-row {
            grid-template-columns: 1fr;
          }

          .study-v2-rating-button {
            border-bottom: 1px solid #dbe2ee;
            border-right: 0;
            min-height: 140px;
          }
        }
      `}</style>
    </>
  );
}
