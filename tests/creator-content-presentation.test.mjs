import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editor, nodes, text, button, expandChrome, source, projectNavyPresentation } from './fixtures/creator-role-workspaces.mjs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');

// Before-state hashes are from released 9585d78, never computed at test runtime.
test('only approved Content presentation differs from the released complete Creator source', () => {
  assert.equal(hash(projectNavyPresentation(source)), "3f918a1d04a8ae237a95fbe350a201f6ce7a77a45091d79f826a80d69a78ae04");
});
test('Home, Stats and Study/Cram match released 9585d78 after only the approved dashboard presentation projection', () => {
  let planner = read('components/StudyPlanner.tsx');
  const homeHeader = `<LearnerHeader classPrefix="home-v2" brandHref="/" onHomeClick={handleHomeClick} items={mode === 'dashboard' ? items.filter(item => item.label !== 'Home') : items} />`;
  assert.equal(planner.split(homeHeader).length, 2);
  planner = planner.replace(homeHeader, '<LearnerHeader classPrefix="home-v2" brandHref="/" onHomeClick={handleHomeClick} items={items} />');
  const marker = ` data-home-dashboard={mode === 'dashboard' ? '' : undefined}`;
  const tree = `                  className="home-v2-setup-tree"
                  aria-label="Home deck settings Topic Tree"
                  role="region"
                  tabIndex={0}`;
  assert.equal(planner.split(marker).length, 2);
  assert.equal(planner.split(tree).length, 2);
  planner = planner.replace(marker, '').replace(tree, `                  className="home-v2-setup-tree"
                  aria-label="Home deck settings Topic Tree"`);
  assert.equal(hash(planner), "2a604d4926d98db0edb7f86d5ac8dbacf95fffde2e6cb4b1b00a3536783704ae");
  const css = read('app/home.css'), boundary = '\n\n/* Home dashboard:';
  assert.equal(css.split(boundary).length, 2);
  const start = css.indexOf(boundary);
  assert.equal(hash(css.slice(start)), '7e2a967b9eb575ca71837eed4b30082691d3b57a1ef5b809e45029b0998e97c3', 'Only the exact approved Home layout block');
  assert.equal(hash(css.slice(0, start)), '08156337bbef31e0e99d08e415f5ec9265f26ed728f9499ad38aa16f49810c1b');
});

for (const role of ['admin', 'editor']) test(`${role}: entire Content workspace uses the scoped design with unchanged controls and draft state`, () => {
  const h = editor({ role, placed: true }); let e = h.render();
  const tree = expandChrome(e.tree);
  assert.ok(nodes(tree).some(n => n.props?.className === 'contentDesign'));
  for (const label of ['Selected Topics', 'Tags', 'Prerequisites', 'Sources / References']) assert.ok(text(tree).includes(label), label);
  for (const label of ['Save Concept', 'New Concept', 'Browse Concepts', 'Add Tag', 'Add Reference', 'Move', 'Delete']) assert.ok(button(tree, label));
  assert.equal(e.isContentDirty, false);
  button(tree, 'Browse Concepts').props.onClick(); e = h.render();
  assert.equal(e.isContentDirty, false); assert.equal(e.isPrerequisiteBrowseOpen, false);
  e.setConcept('Navy draft'); button(e.tree, 'Questions').props.onClick();
  assert.ok(!nodes(expandChrome(h.render().tree)).some(n => n.props?.className === 'contentDesign'));
  button(h.render().tree, 'Content').props.onClick();
  assert.equal(h.render().concept, 'Navy draft'); assert.equal(h.calls.length, 0);
});
test('compact toolbar is opted into by only the official Concept field', () => {
  assert.equal(source.split('hideLabel presentation="compact"').length, 2);
  assert.doesNotMatch(read('components/creator/QuestionMarkdownField.tsx'), /presentation=/);
  const styles = read('components/CreatorStudioV2Client.module.css');
  assert.match(styles, /\.contentDesign \.mainGrid/);
  assert.match(styles, /\.contentDesign \.selectedPanel, \.contentDesign \.sourcesPanel/);
  assert.match(styles, /\.contentDesign \.prerequisitesSection/);
  assert.match(styles, /\.contentDesign \.bottomActions/);
  assert.doesNotMatch(styles.slice(styles.indexOf('/* Approved Content-first')), /\.panel h[23] \{/);
  assert.doesNotMatch(source, /Creator Guide|Tree View|List View/);
});
test('learner Content authority and its existing workspace remain unchanged', () => {
  const h = editor({ role: 'learner', placed: true }), tree = expandChrome(h.render().tree);
  assert.deepEqual(nodes(tree).filter(n => n.props?.role === 'tab').map(text), ['Questions', 'Flagged']);
  assert.ok(!nodes(tree).some(n => /navy|contentDesign|staffWorkspace/.test(n.props?.className || '')));
});
