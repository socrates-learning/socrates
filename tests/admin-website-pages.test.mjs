import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import React from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import * as icons from 'lucide-react';
import { loadConceptModule } from './fixtures/concept-media-authoring.mjs';
import { loadMediaModule } from './fixtures/content-media-images.mjs';

const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const image = { __esModule: true, default: props => React.createElement('img', Object.fromEntries(Object.entries(props).filter(([key]) => !['fill', 'priority', 'sizes'].includes(key)))) };
const common = { react: React, 'react/jsx-runtime': runtime, 'next/image': image, 'lucide-react': icons,
  './PublicHomepage.module.css': css, './PublicInformationPage.module.css': css,
  '@/components/public-homepage/PublicHomepage.module.css': css, '@/components/public-website/PublicInformationPage.module.css': css,
  '@/lib/public-website-routes': loadMediaModule('lib/public-website-routes.ts'),
  '@/lib/request-auth-context': loadMediaModule('lib/request-auth-context.ts'),
  '@/components/public-homepage/public-application-previews': loadMediaModule('components/public-homepage/public-application-previews.ts') };
const actions = loadConceptModule('components/public-homepage/PublicWebsiteActions.tsx', common);
const navigation = loadConceptModule('components/public-homepage/PublicNavigation.tsx', { ...common, './PublicWebsiteActions': actions });
const footer = loadConceptModule('components/public-homepage/PublicFooter.tsx', { ...common, './PublicNavigation': navigation });
const paths = ['how-it-works', 'features', 'pricing', 'about', 'contact'];

async function renderPage(path, authenticated = true) {
  const layout = loadConceptModule('components/public-website/PublicInformationPage.tsx', { ...common,
    '@/lib/server-website-preview-access': { requireAdminWebsitePreview: async () => { if (!authenticated) throw new Error('denied'); } },
    '@/components/public-homepage/PublicNavigation': navigation, '@/components/public-homepage/PublicFooter': footer,
    '@/components/public-homepage/PublicWebsiteActions': actions });
  const page = loadConceptModule(`app/website/${path}/page.tsx`, { ...common,
    '@/components/public-website/PublicInformationPage': layout, '@/components/public-homepage/PublicWebsiteActions': actions });
  const content = page.default();
  const doc = new JSDOM(renderToStaticMarkup(await content.type(content.props))).window.document;
  return { doc, metadata: page.metadata };
}

for (const path of paths) {
  test(`${path}: Admin preview content, navigation and accessible landmarks`, async () => {
    for (const authenticated of [true]) {
      const { doc, metadata } = await renderPage(path, authenticated);
      assert.ok(metadata.title.endsWith('| Socrates')); assert.ok(metadata.description.length > 30);
      assert.equal(doc.querySelectorAll('main').length, 1); assert.equal(doc.querySelectorAll('h1').length, 1);
      assert.ok(doc.querySelector('a[href="#main-content"]')); assert.ok(doc.querySelector('#main-content'));
      for (const label of ['Public website', 'Footer']) {
        const nav = doc.querySelector(`nav[aria-label="${label}"]`);
        const links = [...nav.querySelectorAll('a')].filter(a => a.getAttribute('href').startsWith('/website'));
        assert.deepEqual(links.map(a => a.getAttribute('href')), ['/website', ...paths.map(p => `/website/${p}`)]);
        assert.equal(nav.querySelectorAll('[aria-current="page"]').length, 1);
        assert.equal(nav.querySelector('[aria-current="page"]').getAttribute('href'), `/website/${path}`);
      }
      assert.equal(doc.querySelectorAll('a[href="/"]').length, authenticated ? 1 : 0);
      assert.equal(doc.querySelectorAll('a[href="/login"]').length, authenticated ? 0 : 1);
      assert.equal(doc.querySelector('header a[href="' + (authenticated ? '/' : '/login') + '"]').textContent, authenticated ? 'Back to App' : 'Sign In');
      assert.equal(doc.querySelectorAll('form,input,textarea,select').length, 0, 'No registration, checkout, collection or protected application editor');
      assert.equal(doc.querySelectorAll('dialog').length, 1); assert.match(doc.querySelector('dialog').textContent, /Coming Soon/);
      for (const img of doc.querySelectorAll('img')) assert.ok(existsSync(`public${img.getAttribute('src')}`));
      for (const link of doc.querySelectorAll('a')) assert.ok(['/', '/login', '#main-content', '/website', ...paths.map(p => `/website/${p}`)].includes(link.getAttribute('href')), link.outerHTML);
    }
  });
}

test('Features separates existing application capabilities from deferred public services', async () => {
  const { doc } = await renderPage('features');
  assert.deepEqual([...doc.querySelectorAll('article h3')].map(h => h.textContent), ['Study Mode', 'Cram Mode', 'Study Goals', 'Study Advisor', 'Progress Tracking', 'Personal Notes', 'Your Own Content']);
  assert.match(doc.querySelector('#existing-features').parentElement.textContent, /released.*existing authorized accounts/);
  assert.match(doc.querySelector('#future-features').parentElement.textContent, /registration.*purchases.*contact submissions.*Suggestion Box are deferred/);
});

test('Pricing has no invented prices, checkout or purchase entitlement and reuses Coming Soon', async () => {
  const { doc } = await renderPage('pricing');
  const text = doc.querySelector('main').textContent;
  assert.match(text, /Not yet on sale/); assert.match(text, /Final prices, package contents, and access terms have not been announced/);
  assert.doesNotMatch(text, /[$€£]\s*\d|buy now|start free trial/i);
  assert.equal(doc.querySelectorAll('button[aria-haspopup="dialog"]').length, 2);
  assert.equal(doc.querySelectorAll('details summary').length, 3);
});

test('Contact does not collect visitor messages or invent a contact address', async () => {
  const { doc } = await renderPage('contact');
  assert.match(doc.querySelector('main').textContent, /does not collect or store visitor messages/);
  assert.match(doc.querySelector('main').textContent, /No message form or email-delivery service/);
  assert.equal(doc.querySelectorAll('a[href^="mailto:"], a[href^="tel:"], form, input, textarea').length, 0);
});

for (const path of paths) test(`${path}: denial occurs before informational content is returned`, async () => { await assert.rejects(renderPage(path, false), /denied/); });
