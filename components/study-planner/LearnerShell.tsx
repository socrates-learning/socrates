'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

export type LearnerHeaderPrefix = 'home-v2' | 'study-v2';
export type LearnerNavIcon =
  | 'home'
  | 'learn'
  | 'study'
  | 'progress'
  | 'creator'
  | 'admin'
  | 'account';

type LinkItem = { kind: 'link'; href: string; onClick?: MouseEventHandler<HTMLAnchorElement>; prefetch?: false };
type ButtonItem = { kind: 'button'; onClick?: () => void | Promise<void>; disabled?: boolean; title?: string };
export type HeaderItem = { label: string; icon: LearnerNavIcon; className: string; accountChevron: boolean } & (LinkItem | ButtonItem);
export type RailItem = { label: string; icon: string; className: string } & (LinkItem | ButtonItem);

function LearnerHeaderIcon({
  icon,
  classPrefix,
}: {
  icon: LearnerNavIcon;
  classPrefix: LearnerHeaderPrefix;
}) {
  return (
    <span className={`${classPrefix}-nav-icon`} aria-hidden="true">
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

function RailIcon({ icon }: { icon: string }) {
  return (
    <span className="home-v2-rail-icon" aria-hidden="true">
      {icon === 'document' && (
        <svg viewBox="0 0 40 40">
          <path d="M12 7h12l5 5v21H12z" />
          <path d="M24 7v7h7M16 19h10M16 24h10M16 29h7" />
        </svg>
      )}
      {icon === 'gear' && (
        <svg viewBox="0 0 40 40">
          <path d="M20 13a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" />
          <path d="M20 5v6M20 29v6M5 20h6M29 20h6M9 9l4 4M27 27l4 4M31 9l-4 4M13 27l-4 4" />
        </svg>
      )}
      {icon === 'edit' && (
        <svg viewBox="0 0 40 40">
          <path d="M10 30h20M12 26l2-8 13-13 6 6-13 13zM25 7l6 6" />
        </svg>
      )}
      {icon === 'bars' && (
        <svg viewBox="0 0 40 40">
          <path d="M9 31V19h6v12M17 31V11h6v20M25 31V5h6v26" />
        </svg>
      )}
      {icon === 'people' && (
        <svg viewBox="0 0 40 40">
          <path d="M15 19a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM5 33c1-7 5-10 10-10s9 3 10 10" />
          <path d="M27 20a5 5 0 1 0-1-10M26 24c4 1 7 4 8 9" />
        </svg>
      )}
      {icon === 'dots' && (
        <svg viewBox="0 0 40 40">
          <path d="M11 20h.1M20 20h.1M29 20h.1" />
        </svg>
      )}
    </span>
  );
}

export function LearnerHeader({ classPrefix, brandHref, onHomeClick, items }: {
  classPrefix: LearnerHeaderPrefix;
  brandHref: string;
  onHomeClick: MouseEventHandler<HTMLAnchorElement>;
  items: readonly HeaderItem[];
}) {
  return (
      <header className={`${classPrefix}-header`}>
        <Link
          className={`${classPrefix}-brand`}
          href={brandHref}
          onClick={onHomeClick}
          prefetch={false}
        >
          {classPrefix === 'home-v2' ? (
            <Image
              alt="Socrates — Learn anything."
              className="home-v2-brand-logo"
              height={152}
              priority
              src="/brand/socrates-logo-dark.png"
              width={270}
            />
          ) : (
            <>
              <Image
                alt="Socrates owl mark"
                className={`${classPrefix}-brand-mark`}
                height={66}
                src="/brand/socrates-mark.png"
                width={76}
              />
              <div>
                <strong>Socrates</strong>
                <span>Learn anything.</span>
              </div>
            </>
          )}
        </Link>

        <nav className={`${classPrefix}-nav`} aria-label="Socrates learner navigation">
          {items.map((item) => {
            const content = <><LearnerHeaderIcon icon={item.icon} classPrefix={classPrefix} />{item.label}{item.accountChevron && <span aria-hidden="true">⌄</span>}</>;
            return item.kind === 'link' ? (
              <Link className={item.className} href={item.href} key={item.label} onClick={item.onClick} prefetch={item.prefetch}>{content}</Link>
            ) : (
              <button className={item.className} key={item.label} type="button" disabled={item.disabled} onClick={item.onClick} title={item.title}>{content}</button>
            );
          })}
        </nav>
      </header>
  );
}

export function HomeRail({ items, onLogout }: {
  items: readonly RailItem[];
  onLogout: () => void | Promise<void>;
}) {
  return (
    <aside className="home-v2-rail" aria-label="Deck navigation">
      <div className="home-v2-rail-list">
        {items.map((item) => {
          const content = <><RailIcon icon={item.icon} /><span>{item.label}</span></>;
          return item.kind === 'link' ? (
            <Link className={item.className} href={item.href} key={item.label} onClick={item.onClick}>{content}</Link>
          ) : (
            <button className={item.className} key={item.label} title={item.title} type="button" onClick={item.onClick}>{content}</button>
          );
        })}
      </div>
      <button className="home-v2-logout" type="button" onClick={onLogout}>
        <RailIcon icon="edit" />
        <span>Log Out</span>
      </button>
    </aside>
  );
}

export function LibrarySubjectSwitcher({ options, label, defaultSlug, submitLabel, disabled, standalone, action, returnTo }: {
  options: readonly { id: string; slug: string; name: string }[];
  label: string;
  defaultSlug: string;
  submitLabel: string;
  disabled: boolean;
  standalone: boolean;
  action: string;
  returnTo: string;
}) {
  return (
      <form
        action={action}
        className="home-v2-library-switcher"
        method="post"
        style={
          standalone
            ? {
              alignItems: 'end',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 18,
              maxWidth: 420,
            }
            : undefined
        }
      >
        <label
          style={
            standalone
              ? { display: 'grid', flex: '1 1 240px', gap: 5 }
              : undefined
          }
        >
          <span
            style={
              standalone
                ? {
                  color: '#59687f',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }
                : undefined
            }
          >
            {label}
          </span>
          <select
            aria-label={label}
            defaultValue={defaultSlug}
            name="library_slug"
            style={
              standalone
                ? {
                  background: '#ffffff',
                  border: '1px solid #c7d1e0',
                  borderRadius: 8,
                  color: '#17233a',
                  font: 'inherit',
                  minHeight: 42,
                  padding: '8px 10px',
                  width: '100%',
                }
                : undefined
            }
          >
            {options.map((library) => (
              <option key={library.id} value={library.slug}>
                {library.name}
              </option>
            ))}
          </select>
        </label>
        <input name="return_to" type="hidden" value={returnTo} />
        <button
          disabled={disabled}
          type="submit"
          style={
            standalone
              ? {
                background: '#155ee8',
                border: '1px solid #0f4fc7',
                borderRadius: 8,
                color: '#ffffff',
                cursor: 'pointer',
                font: 'inherit',
                fontWeight: 800,
                minHeight: 42,
                padding: '8px 14px',
              }
              : undefined
          }
        >
          {submitLabel}
        </button>
      </form>
  );
}

type FallbackProps =
  | { variant: 'loading'; skeletonKeys: readonly string[] }
  | { variant: 'error'; errorText: string; onRetry: () => void }
  | { variant: 'no-library'; librarySwitcher: ReactNode; showNoActiveLibraries: boolean }
  | { variant: 'deck-error'; message: string };

export function PlannerFallback(props: FallbackProps) {
  if (props.variant === 'loading') {
    const { skeletonKeys } = props;
    return (
        <main
          aria-label="Loading your deck"
          aria-live="polite"
          style={{
            alignItems: 'stretch',
            background: '#f3f6fb',
            display: 'flex',
            flexWrap: 'wrap',
            minHeight: 'calc(100vh - 126px)',
          }}
        >
          <aside
            aria-hidden="true"
            style={{
              background: 'linear-gradient(180deg, #0c4dc3, #0a3c9f)',
              boxSizing: 'border-box',
              display: 'grid',
              flex: '1 1 190px',
              gap: 14,
              minHeight: 420,
              padding: 22,
            }}
          >
            {skeletonKeys.map((key) => (
              <div
                key={key}
                style={{
                  background: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: 12,
                  minHeight: 62,
                }}
              />
            ))}
          </aside>
          <section
            style={{
              boxSizing: 'border-box',
              flex: '5 1 540px',
              padding: '32px clamp(20px, 4vw, 54px)',
            }}
          >
            <p
              style={{
                color: '#48617f',
                fontSize: 15,
                fontWeight: 700,
                margin: '0 0 14px',
              }}
            >
              Loading your deck…
            </p>
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #dfe6f0',
                borderRadius: 18,
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.07)',
                minHeight: 130,
              }}
            />
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #dfe6f0',
                borderRadius: 18,
                boxShadow: '0 12px 30px rgba(15, 23, 42, 0.07)',
                marginTop: 22,
                minHeight: 300,
              }}
            />
          </section>
        </main>
    );
  }
  if (props.variant === 'error') {
    const { errorText, onRetry } = props;
    return (
        <main style={{ padding: 24 }}>
          <div className="panel" role="alert">
            <h2>Home could not be loaded</h2>
            <p className="muted">{errorText}</p>
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          </div>
        </main>
    );
  }
  if (props.variant === 'no-library') {
    const { librarySwitcher, showNoActiveLibraries } = props;
    return (
        <main style={{ padding: 24 }}>
          <div className="panel">
            <h2>Choose a Library</h2>
            <p className="muted">
              Choose an active Library before setting up or opening your deck.
            </p>
            {librarySwitcher}
            {showNoActiveLibraries && (
                <p className="muted">No active Libraries are available.</p>
              )}
          </div>
        </main>
    );
  }
  const { message } = props;
  return (
      <div className="panel">
        <h2>Deck Dashboard</h2>
        <p className="muted">{message}</p>
      </div>
  );
}
