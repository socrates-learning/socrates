import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const planner = readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../components/study-planner/StudyModeStyles.tsx', import.meta.url), 'utf8');
const parse = (name, text) => ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root, predicate) {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

// Exact approved Front-only typography; every other style byte remains frozen.
const approvedTypography = `        .study-v2-question-content[data-front-size="short"] > h1:not(.study-v2-sr-only) {
          font-size: 2.6875rem;
        }

        .study-v2-question-content[data-front-size="medium"] > h1:not(.study-v2-sr-only) {
          font-size: 2rem;
        }

        .study-v2-question-content[data-front-size="long"] {
          justify-content: flex-start;
        }

        .study-v2-question-content[data-front-size="long"] > h1:not(.study-v2-sr-only) {
          font-size: 1.5rem;
          margin-top: 0;
          margin-bottom: 0;
        }

        @media (max-width: 900px) {
          .study-v2-question-content[data-front-size="short"] > h1:not(.study-v2-sr-only) {
            font-size: 2.0625rem;
          }

          .study-v2-question-content[data-front-size="medium"] > h1:not(.study-v2-sr-only) {
            font-size: 1.75rem;
          }

          .study-v2-question-content[data-front-size="long"] > h1:not(.study-v2-sr-only) {
            font-size: 1.375rem;
          }
        }

        @media (max-width: 520px) {
          .study-v2-question-content[data-front-size="short"] > h1:not(.study-v2-sr-only) {
            font-size: 1.75rem;
          }

          .study-v2-question-content[data-front-size="medium"] > h1:not(.study-v2-sr-only) {
            font-size: 1.5rem;
          }

          .study-v2-question-content[data-front-size="long"] > h1:not(.study-v2-sr-only) {
            font-size: 1.25rem;
          }
        }

`;

test('Study CSS matches the original branding fingerprint after projecting only approved Front centering and typography', () => {
  const file = parse('StudyModeStyles.tsx', styles);
  const literals = find(file, ts.isNoSubstitutionTemplateLiteral);
  assert.equal(literals.length, 1);
  const css = styles.slice(literals[0].getStart(file) + 1, literals[0].end - 1);
  const approvedFront = `        .study-v2-question-content {
          animation: study-v2-content-in 200ms ease-out;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: safe center;`;
  assert.equal(css.split(approvedFront).length - 1, 1, 'Only the exact Front declaration is projected');
  assert.equal(css.split(approvedTypography).length - 1, 1, 'Only the exact approved typography block is projected');
  const releasedCss = css.replace(approvedTypography, '').replace(approvedFront, approvedFront.replace('justify-content: safe center;', 'justify-content: center;'));
  // Frozen from d6ddef76d62d1fa1d50f649ee1c85a28d974ec6b, not generated from the candidate.
  assert.equal(createHash('sha256').update(releasedCss).digest('hex'),
    '9054a53e9df11fff9410d1d88da74d8863c24229b2f3658f30151ee5ae5489ae');
  assert.equal(find(file, ts.isTemplateExpression).length, 0);
});

test('style component adds no wrapper, state, effects or alternate style mechanism', () => {
  const file = parse('StudyModeStyles.tsx', styles);
  const elements = find(file, ts.isJsxElement);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].openingElement.tagName.getText(file), 'style');
  assert.deepEqual(elements[0].openingElement.attributes.properties.map(p => p.name.getText(file)), ['jsx', 'global']);
  assert.equal(find(file, ts.isCallExpression).length, 0);
  assert.equal(find(file, ts.isImportDeclaration).length, 0);
  assert.equal(find(file, ts.isJsxSelfClosingElement).length, 0);
});

test('single style mount remains after Study main in the Study-only return', () => {
  const file = parse('StudyPlanner.tsx', planner);
  const mounts = find(file, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(file) === 'StudyModeStyles');
  assert.equal(mounts.length, 1);
  const mount = mounts[0];
  assert.equal(mount.attributes.properties.length, 0);
  let ancestor = mount.parent;
  while (ancestor && !ts.isIfStatement(ancestor)) ancestor = ancestor.parent;
  assert.ok(ancestor, 'mount has a conditional ancestor');
  assert.equal(ancestor.expression.getText(file), "mode === 'study'");
  assert.ok(ts.isJsxFragment(mount.parent));
  const siblings = mount.parent.children.filter(n => !ts.isJsxText(n));
  assert.equal(siblings.at(-1), mount);
  const main = siblings.at(-2);
  assert.ok(ts.isJsxElement(main));
  assert.equal(main.openingElement.tagName.getText(file), 'main');
  assert.equal(find(file, n => ts.isJsxElement(n) && n.openingElement.tagName.getText(file) === 'style').length, 0);
});
