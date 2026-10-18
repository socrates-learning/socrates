import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { loadMediaModule } from './fixtures/content-media-images.mjs';
import { loadConceptModule } from './fixtures/concept-media-authoring.mjs';

function accessFixture({ user = true, role = 'admin', active = true, authError = null, roleError = null, activeError = null } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => {
      calls.push('verified-user');
      return { data: { user: user ? { id: 'verified-actor', user_metadata: { role: 'admin' } } : null }, error: authError };
    } },
    from(table) {
      assert.equal(table, 'user_roles');
      return { select(column) {
        assert.equal(column, 'role');
        return { eq(column, id) {
          calls.push(['role', column, id]);
          return { maybeSingle: async () => ({ data: role ? { role } : null, error: roleError }) };
        } };
      } };
    },
    rpc: async name => {
      assert.equal(name, 'account_is_active'); calls.push(name);
      return { data: active, error: activeError };
    },
  };
  const guard = loadMediaModule('lib/server-website-preview-access.ts', {
    'server-only': {}, react: { cache: fn => fn },
    'next/navigation': { redirect: path => { throw new Error(`redirect:${path}`); } },
    '@/lib/supabase-server': { createSupabaseServerClient: async () => client },
  }).requireAdminWebsitePreview;
  return { guard, calls };
}

test('active Admin is checked with existing Auth, database role and account state', async () => {
  const { guard, calls } = accessFixture(); await guard();
  assert.deepEqual(calls, ['verified-user', ['role', 'user_id', 'verified-actor'], 'account_is_active']);
});
for (const role of ['editor', 'learner', null, 'unknown', 'Admin']) {
  test(`${role}: database role denies access despite forged Admin user metadata`, async () => {
    await assert.rejects(accessFixture({ role }).guard(), /^Error: redirect:\/$/);
  });
}
for (const scenario of [{ user: false }, { authError: { message: 'revoked session' } }]) {
  test(`unverified identity is rejected before any database access: ${JSON.stringify(scenario)}`, async () => {
    const { guard, calls } = accessFixture(scenario);
    await assert.rejects(guard(), /redirect:\/login\?next=%2Fwebsite/);
    assert.deepEqual(calls, ['verified-user']);
  });
}
for (const active of [false, null, 'true', 1]) {
  test(`Admin account requires a positive active-account result: ${String(active)}`, async () => {
    await assert.rejects(accessFixture({ active }).guard(), /^Error: redirect:\/$/);
  });
}
for (const error of ['roleError', 'activeError']) {
  test(`${error} fails closed even if a response also contains Admin/active data`, async () => {
    await assert.rejects(accessFixture({ [error]: { message: 'unavailable' } }).guard(), /^Error: redirect:\/$/);
  });
}

test('layout and homepage each enforce authorization before returning website content', async () => {
  for (const path of ['app/website/layout.tsx', 'app/website/page.tsx']) {
    for (const allowed of [false, true]) {
      let verified = 0;
      const pageModule = loadConceptModule(path, {
        'react/jsx-runtime': jsxRuntime,
        '@/components/public-homepage/PublicHomepage': { __esModule: true, default: 'homepage' },
        '@/lib/server-website-preview-access': { requireAdminWebsitePreview: async () => {
          verified++; if (!allowed) throw new Error('denied');
        } },
      });
      const promise = pageModule.default({ children: 'private content' });
      if (!allowed) await assert.rejects(promise, /denied/);
      else {
        const result = await promise;
        assert.equal(path.endsWith('layout.tsx') ? result : result.props.authenticated, path.endsWith('layout.tsx') ? 'private content' : true);
      }
      assert.equal(verified, 1);
      if (path.endsWith('layout.tsx')) {
        assert.equal(pageModule.dynamic, 'force-dynamic');
        assert.equal(pageModule.metadata.robots.index, false);
      }
    }
  }
});

const css = { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
const shell = loadConceptModule('components/application-shell/SocratesShell.tsx', {
  react: React, 'react/jsx-runtime': jsxRuntime,
  'next/link': { __esModule: true, default: 'a' }, 'next/image': { __esModule: true, default: 'img' },
  'next/navigation': { useRouter: () => ({}), usePathname: () => '/' },
  '@/lib/supabase': { supabase: {} },
  '@/lib/application-shell-navigation': loadMediaModule('lib/application-shell-navigation.ts'),
  './SocratesShell.module.css': css,
});
for (const role of ['admin', 'editor', 'learner', null]) for (const home of [true, false]) {
  test(`Visit Website is confined to Admin Home navigation: role=${role}, home=${home}`, () => {
    const html = renderToStaticMarkup(React.createElement(shell.ApplicationNavigation, { role, home }));
    const doc = new JSDOM(html).window.document;
    const link = doc.querySelector('a[href="/website"]');
    assert.equal(Boolean(link), home && role === 'admin');
    if (link) {
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
      assert.match(link.getAttribute('aria-label'), /new tab/);
    }
    assert.equal(Boolean(doc.querySelector('button[aria-label="Log Out"]')), home);
    assert.ok(doc.querySelector('a[href="/account"]'));
    assert.equal(Boolean(doc.querySelector('a[href="/admin/users"]')), role === 'admin');
  });
}
