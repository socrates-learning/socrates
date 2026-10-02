import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { conceptMedia as m, ids, hookHarness, loadConceptModule, jsx } from './fixtures/concept-media-authoring.mjs';
const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const MarkdownContent = function MarkdownContent() {};
const placement = { placementId: ids.placement, assetId: ids.asset, ordinal: 0, altText: 'An accessible synthetic figure', caption: '<script>literal caption</script>', mime: 'image/png', width: 2, height: 3, sha256: createHash('sha256').update('image').digest('hex') };
const context = { kind: 'concept', conceptId: '11400000-0000-4000-8000-000000000005', libraryId: ids.library };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(fetch = () => { throw Error('Unexpected media request'); }, extras = {}) {
  const hooks = hookHarness();
  const image = loadConceptModule('components/VerifiedMediaImage.tsx', { react: hooks.hooks, 'react/jsx-runtime': jsx, 'next/image': 'Image', './ConceptMedia.module.css': {} }, { fetch, crypto: webcrypto, ...extras });
  const mod = loadConceptModule('components/ConceptMediaContent.tsx', { react: hooks.hooks, 'react/jsx-runtime': jsx, 'next/image': 'Image', './VerifiedMediaImage': image, './MarkdownContent': { MarkdownContent }, '@/lib/concept-media': m, './ConceptMedia.module.css': {} }, { fetch, crypto: webcrypto, ...extras });
  return { ...mod, hooks, renderVerified(props) {
    const boundary = mod.VerifiedConceptImage(props);
    assert.equal(boundary.type, image.default);
    assert.equal(boundary.props.placement, props.placement);
    assert.equal(boundary.props.src, mod.conceptImageSource(props.placement, props.context));
    return image.default(boundary.props);
  } };
}
test('no-image and malformed-token Concept rendering is exactly the released Markdown boundary, without fetching', () => {
  const { default: render, hooks } = setup();
  for (const markdown of ['Ordinary **Markdown**', '', 'inline [[socrates-media:broken]]', `Text\n${m.conceptMediaToken(ids.placement)}`]) {
    const tree = hooks.render(() => render({ markdown, ...context })); hooks.effects();
    assert.equal(tree.type, MarkdownContent);
    assert.deepEqual(Object.keys(tree.props), ['markdown']);
    assert.equal(tree.props.markdown, markdown);
  }
});
test('draft figure uses the exact author-qualified preview endpoint; published figure uses placement delivery', () => {
  const s = setup();
  assert.equal(s.conceptImageSource(placement, context), `/api/content-media/delivery/${ids.placement}`);
  const preview = s.conceptImageSource({ ...placement, reservationId: ids.asset }, { kind: 'draft', draftId: ids.placement, libraryId: ids.library });
  assert.equal(preview, `/api/content-media/concepts/new/drafts/${ids.asset}?libraryId=${ids.library}&draftId=${ids.placement}`);
  const tree = s.hooks.render(() => s.default({ markdown: `Before\n\n${m.conceptMediaToken(ids.placement)}`, context, placements: [placement] }));
  assert.equal(tree.props.renderConceptBlock('Before', 0), undefined);
  const figure = tree.props.renderConceptBlock('', 2);
  assert.equal(figure.type, s.VerifiedConceptImage);
  assert.equal(figure.props.placement, placement);
  assert.equal(figure.props.context, context);
});
test('missing, unauthorized and stale manifests leave visible token fallback, not another Concept image', async () => {
  let resolve;
  const s = setup(() => new Promise(r => { resolve = r; }));
  const markdown = m.conceptMediaToken(ids.placement);
  const props = { markdown, conceptId: context.conceptId, libraryId: ids.library };
  let tree = s.hooks.render(() => s.default(props)); s.hooks.effects();
  assert.equal(tree.props.renderConceptBlock('', 0).type, 'figure');
  resolve(Response.json({ conceptId: context.conceptId, bodyMarkdown: 'stale', placements: [placement] })); await flush();
  tree = s.hooks.render(() => s.default(props));
  assert.equal(tree.props.renderConceptBlock('', 0).type, 'figure');
  assert.match(JSON.stringify(tree.props.renderConceptBlock('', 0)), /Image unavailable/);
  s.hooks.cleanup();
});
test('verified image uses private digest-matching bytes, alt/caption and unoptimized rendering; revokes display URL', async () => {
  const calls = [], revoked = [];
  const browserURL = class extends URL { static createObjectURL() { return 'blob:synthetic'; } static revokeObjectURL(url) { revoked.push(url); } };
  const s = setup(async (url, options) => { calls.push({ url, options }); return new Response('image', { headers: { 'content-type': 'image/png' } }); }, { URL: browserURL });
  s.hooks.render(() => s.renderVerified({ placement, context })); s.hooks.effects(); await flush(); await flush();
  const tree = s.hooks.render(() => s.renderVerified({ placement, context }));
  const img = tree.props.children[0].props.children;
  assert.equal(tree.props.children[0].props.style.width, 'min(100%, 2px)', 'Small images reserve their intrinsic width without a large blank frame');
  assert.equal(img.type, 'Image'); assert.equal(img.props.alt, placement.altText); assert.equal(img.props.unoptimized, true);
  assert.equal(img.props.src, 'blob:synthetic'); assert.equal(tree.props.children[1].props.children, placement.caption);
  assert.equal(calls[0].options.credentials, 'same-origin'); assert.equal(calls[0].options.cache, 'no-store');
  s.hooks.cleanup(); assert.deepEqual(revoked, ['blob:synthetic']);
});
test('invalid MIME or digest never becomes a display URL', async () => {
  for (const mime of ['text/html', 'image/png']) {
    const s = setup(async () => new Response('wrong bytes', { headers: { 'content-type': mime } }), { URL: class extends URL { static createObjectURL() { throw Error('Must not display'); } } });
    s.hooks.render(() => s.renderVerified({ placement, context })); s.hooks.effects(); await flush(); await flush();
    assert.match(JSON.stringify(s.hooks.render(() => s.renderVerified({ placement, context }))), /Image unavailable/);
  }
});
test('all four official Concept renderers pass actual context; Card and personal paths retain their boundary', () => {
  assert.match(text('components/CreatorStudioV2Client.tsx'), /conceptSource === 'official' && conceptImages.usesMedia/);
  assert.match(text('components/ConceptTabs.tsx'), /<ConceptMediaContent markdown=\{bodyMarkdown \|\| ''\} conceptId=\{conceptId\} libraryId=\{libraryId\}/);
  assert.match(text('components/StudyPlanner.tsx'), /<ConceptMediaContent markdown=\{conceptReview.bodyMarkdown\} conceptId=\{conceptReview.conceptId\} libraryId=\{activeLibrary\?\.id\}/);
  assert.match(text('components/SocratesStudyCreatorBrowser.tsx'), /<ConceptMediaContent/);
  assert.doesNotMatch(text('components/ConceptMediaContent.tsx'), /dangerouslySetInnerHTML|createSignedUrl/);
  const css = text('components/ConceptMedia.module.css');
  assert.match(css, /max-width: 100%/); assert.match(css, /flex-wrap: wrap/); assert.match(css, /:focus-visible/);
});
