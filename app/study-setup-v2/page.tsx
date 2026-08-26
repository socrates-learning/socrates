'use client';

import Link from 'next/link';
import { useState } from 'react';

type NavItem = {
  href?: string;
  icon: 'home' | 'learn' | 'study' | 'progress' | 'creator' | 'admin' | 'account';
  label: string;
};

const navItems: NavItem[] = [
  { href: '/', icon: 'home', label: 'Home' },
  { icon: 'learn', label: 'Learn' },
  { icon: 'study', label: 'Study' },
  { icon: 'progress', label: 'Progress' },
  { href: '/creator', icon: 'creator', label: 'Creator Studio' },
  { href: '/admin/users', icon: 'admin', label: 'Admin' },
  { icon: 'account', label: 'Account' },
];

function HeaderIcon({ icon }: { icon: NavItem['icon'] }) {
  return (
    <span className="study-setup-v2-nav-icon" aria-hidden="true">
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

function PrototypeHeader() {
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
    <header className="study-setup-v2-header">
      <Link className="study-setup-v2-brand" href="/" onClick={handleHomeClick}>
        <strong>Socrates</strong>
        <span>Real application foundation · concept-network learning platform</span>
      </Link>

      <nav className="study-setup-v2-nav" aria-label="Socrates prototype navigation">
        {navItems.map((item) => {
          const isStudy = item.icon === 'study';
          const isAccount = item.icon === 'account';
          const className = [
            'study-setup-v2-nav-item',
            isStudy ? 'study-setup-v2-nav-active' : '',
            isAccount ? 'study-setup-v2-nav-account' : '',
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
              key={item.label}
              type="button"
              onClick={isStudy ? handleStudyClick : undefined}
              disabled={!isStudy && !isAccount}
            >
              {content}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

export default function StudySetupV2Page() {
  const [sliderValue, setSliderValue] = useState(50);
  const [isCramMode, setIsCramMode] = useState(false);

  return (
    <>
      <PrototypeHeader />
      <main className="study-setup-v2-page">
        <section className="study-setup-v2-card" aria-labelledby="study-setup-v2-title">
          <div className="study-setup-v2-title-block">
            <h1 id="study-setup-v2-title">Study Mode</h1>
            <p>Adjust the slider to balance new material and mastery review.</p>
          </div>

          <div className="study-setup-v2-copy-row">
            <div>
              <h2>More New Evidence</h2>
              <p>Focus on new concepts and building knowledge.</p>
            </div>
            <div>
              <h2>More Repetition for Mastery</h2>
              <p>Reinforce what you know and strengthen long-term mastery.</p>
            </div>
          </div>

          <section className="study-setup-v2-slider-area" aria-label="Study mode preference">
            <div className="study-setup-v2-slider-wrap">
              <div className="study-setup-v2-slider-track" aria-hidden="true">
                <span style={{ width: `${sliderValue}%` }} />
              </div>
              <input
                aria-label="Study mode balance"
                className="study-setup-v2-slider"
                max="100"
                min="0"
                type="range"
                value={sliderValue}
                onChange={(event) => setSliderValue(Number(event.target.value))}
              />
            </div>

            <div className="study-setup-v2-ticks" aria-hidden="true">
              {Array.from({ length: 9 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>

            <div className="study-setup-v2-labels">
              <span>Learn</span>
              <strong>Study</strong>
              <span>Cram</span>
            </div>
          </section>

          <div className="study-setup-v2-rule" aria-hidden="true" />

          <section className="study-setup-v2-info">
            <span className="study-setup-v2-info-icon" aria-hidden="true">
              i
            </span>
            <div>
              <h2>How it works</h2>
              <p>
                Questions are selected based on your chosen balance, your progress,
                and what will help you learn most effectively right now.
              </p>
            </div>
          </section>

          <label className="study-setup-v2-cram">
            <input
              checked={isCramMode}
              type="checkbox"
              onChange={() => setIsCramMode((current) => !current)}
            />
            <span>
              <strong>Cram Mode</strong>
              <small>Maximize number of questions. Less variety, more volume.</small>
            </span>
          </label>
        </section>
      </main>

      <style jsx global>{`
        .study-setup-v2-header {
          align-items: center;
          background: linear-gradient(180deg, #061846, #041238);
          color: #ffffff;
          display: flex;
          gap: 28px;
          justify-content: space-between;
          min-height: 126px;
          padding: 34px 36px 28px;
        }

        .study-setup-v2-brand {
          color: #ffffff;
          display: block;
          min-width: 500px;
        }

        .study-setup-v2-brand strong {
          display: block;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 42px;
          font-weight: 900;
          letter-spacing: -0.055em;
          line-height: 0.95;
        }

        .study-setup-v2-brand span {
          color: #edf4ff;
          display: block;
          font-size: 16px;
          font-weight: 500;
          letter-spacing: -0.02em;
          margin-top: 10px;
        }

        .study-setup-v2-nav {
          align-items: center;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: flex-end;
        }

        .study-setup-v2-nav-item {
          align-items: center;
          background: rgba(6, 24, 70, 0.72);
          border: 1px solid rgba(214, 224, 246, 0.36);
          border-radius: 9px;
          color: #ffffff;
          display: inline-flex;
          font: inherit;
          font-size: 16px;
          font-weight: 800;
          gap: 9px;
          min-height: 58px;
          padding: 13px 16px;
          white-space: nowrap;
        }

        .study-setup-v2-nav-item:disabled {
          cursor: default;
          opacity: 1;
        }

        .study-setup-v2-nav-active,
        .study-setup-v2-nav-account {
          background: #155ee8;
          border-color: #2b71ff;
          box-shadow: 0 12px 26px rgba(21, 94, 232, 0.25);
        }

        .study-setup-v2-nav-icon {
          display: inline-flex;
          height: 23px;
          width: 23px;
        }

        .study-setup-v2-nav-icon svg {
          fill: none;
          height: 100%;
          stroke: currentColor;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2.1;
          width: 100%;
        }

        .study-setup-v2-page {
          background: #f8fafc;
          display: flex;
          justify-content: center;
          min-height: calc(100vh - 126px);
          padding: 52px 40px 64px;
        }

        .study-setup-v2-card {
          background: #ffffff;
          border: 1px solid #e5eaf2;
          border-radius: 14px;
          box-shadow: 0 18px 36px rgba(15, 23, 42, 0.14);
          max-width: 1228px;
          padding: 36px 62px 72px;
          width: 100%;
        }

        .study-setup-v2-title-block {
          text-align: center;
        }

        .study-setup-v2-title-block h1 {
          color: #08143b;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 50px;
          font-weight: 900;
          letter-spacing: -0.055em;
          line-height: 1;
          margin: 0 0 18px;
        }

        .study-setup-v2-title-block p {
          color: #384463;
          font-size: 21px;
          letter-spacing: -0.02em;
          margin: 0;
        }

        .study-setup-v2-copy-row {
          display: grid;
          gap: 28px;
          grid-template-columns: 1fr 1fr;
          margin: 58px 0 44px;
        }

        .study-setup-v2-copy-row div:last-child {
          justify-self: end;
          max-width: 370px;
        }

        .study-setup-v2-copy-row h2 {
          color: #0955e8;
          font-size: 23px;
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1.1;
          margin: 0 0 12px;
        }

        .study-setup-v2-copy-row p {
          color: #2c3654;
          font-size: 19px;
          line-height: 1.45;
          margin: 0;
          max-width: 310px;
        }

        .study-setup-v2-slider-area {
          position: relative;
        }

        .study-setup-v2-slider-wrap {
          height: 58px;
          position: relative;
        }

        .study-setup-v2-slider-track {
          background: #e5e8ee;
          border-radius: 999px;
          box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.14);
          height: 14px;
          left: 0;
          overflow: hidden;
          position: absolute;
          right: 0;
          top: 22px;
        }

        .study-setup-v2-slider-track span {
          background: #0f5ee8;
          border-radius: inherit;
          display: block;
          height: 100%;
        }

        .study-setup-v2-slider {
          appearance: none;
          background: transparent;
          border: 0;
          height: 58px;
          margin: 0;
          padding: 0;
          position: relative;
          width: 100%;
          z-index: 2;
        }

        .study-setup-v2-slider::-webkit-slider-runnable-track {
          background: transparent;
          border: 0;
          height: 14px;
        }

        .study-setup-v2-slider::-moz-range-track {
          background: transparent;
          border: 0;
          height: 14px;
        }

        .study-setup-v2-slider::-webkit-slider-thumb {
          appearance: none;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
          height: 58px;
          margin-top: -22px;
          width: 58px;
        }

        .study-setup-v2-slider::-moz-range-thumb {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
          height: 58px;
          width: 58px;
        }

        .study-setup-v2-ticks {
          display: grid;
          grid-template-columns: repeat(9, 1fr);
          margin: 0 84px;
        }

        .study-setup-v2-ticks span {
          background: #c7ced8;
          height: 13px;
          justify-self: center;
          width: 1px;
        }

        .study-setup-v2-labels {
          color: #161f38;
          display: flex;
          font-size: 18px;
          justify-content: space-between;
          margin-top: 24px;
          padding: 0 24px;
        }

        .study-setup-v2-labels strong {
          font-weight: 900;
        }

        .study-setup-v2-rule {
          border-top: 1px solid #d9dee8;
          margin: 64px 0 54px;
        }

        .study-setup-v2-info {
          align-items: flex-start;
          background: #eff6ff;
          border-radius: 10px;
          display: flex;
          gap: 26px;
          margin: 0 14px;
          padding: 34px 34px 32px;
        }

        .study-setup-v2-info-icon {
          align-items: center;
          border: 2px solid #0f5ee8;
          border-radius: 999px;
          color: #0f5ee8;
          display: inline-flex;
          flex: 0 0 30px;
          font-family: Georgia, "Times New Roman", Times, serif;
          font-size: 22px;
          font-weight: 900;
          height: 30px;
          justify-content: center;
          line-height: 1;
          margin-top: 4px;
          width: 30px;
        }

        .study-setup-v2-info h2 {
          color: #0955e8;
          font-size: 23px;
          font-weight: 900;
          letter-spacing: -0.04em;
          margin: 0 0 12px;
        }

        .study-setup-v2-info p {
          color: #2d3654;
          font-size: 18px;
          line-height: 1.45;
          margin: 0;
          max-width: 720px;
        }

        .study-setup-v2-cram {
          align-items: flex-start;
          color: #101a36;
          display: flex;
          gap: 14px;
          margin: 50px auto 0;
          max-width: 320px;
        }

        .study-setup-v2-cram input {
          accent-color: #0f5ee8;
          height: 24px;
          margin-top: 3px;
          width: 24px;
        }

        .study-setup-v2-cram strong {
          display: block;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.035em;
          line-height: 1.1;
          margin-bottom: 10px;
        }

        .study-setup-v2-cram small {
          color: #2f3a59;
          display: block;
          font-size: 16px;
          line-height: 1.45;
        }

        @media (max-width: 1100px) {
          .study-setup-v2-header {
            align-items: flex-start;
            flex-direction: column;
            min-height: auto;
          }

          .study-setup-v2-brand {
            min-width: 0;
          }

          .study-setup-v2-nav {
            justify-content: flex-start;
          }
        }

        @media (max-width: 900px) {
          .study-setup-v2-page {
            min-height: auto;
            padding: 28px 18px 42px;
          }

          .study-setup-v2-card {
            padding: 30px 24px 42px;
          }

          .study-setup-v2-title-block h1 {
            font-size: 40px;
          }

          .study-setup-v2-copy-row {
            grid-template-columns: 1fr;
          }

          .study-setup-v2-copy-row div:last-child {
            justify-self: start;
          }

          .study-setup-v2-labels {
            padding: 0;
          }
        }
      `}</style>
    </>
  );
}
