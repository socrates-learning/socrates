import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/StudyPlanner.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('StudyPlanner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let statusExpression, feedbackExpression;
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression) {
    const expression = node.expression.getText(ast);
    if (expression.startsWith('(studySubmissionStatus ===') && expression.includes('<div className="study-v2-submission-status"')) statusExpression = expression;
    if (expression.startsWith('studyFeedback === null ?')) feedbackExpression = expression;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(statusExpression && feedbackExpression);
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'fragment' };
const walk = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children)];
const text = value => typeof value === 'string' ? value : !value ? '' : Array.isArray(value) ? value.map(text).join(' ') : text(value.props?.children);
function render(status, { kind = 'official', feedback = 'up' } = {}) {
  const calls = [];
  const context = { exports: {}, require: () => jsx,
    studySubmissionStatus: status, studyFeedback: feedback, studyResponse: 'easy', studyCandidate: { kind },
    studySubmission: { current: { id: 'frozen-id', response: 'easy' } },
    persistFinalStudyResponse: value => calls.push(['save', value]), retryNextStudyCard: () => calls.push(['next']),
    leaveStudyMode: value => calls.push(['leave', value]), setStudyFeedback: value => calls.push(['feedback', value]), setStudyResponse: value => calls.push(['response', value]),
  };
  vm.runInNewContext(ts.transpileModule(`export const tree = <>{${statusExpression}}{${feedbackExpression}}</>;`, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return { tree: context.exports.tree, calls };
}
const ratings = tree => walk(tree).filter(n => n.type === 'button' && n.props.className?.startsWith('study-v2-rating-button'));

for (const kind of ['official', 'personal']) {
  test(`${kind}: pending save and next selection retain the same rating controls without a visible interruption`, () => {
    const idle = render('idle', { kind }).tree;
    assert.equal(ratings(idle).length, 3);
    for (const status of ['saving', 'loading-next']) {
      const { tree, calls } = render(status, { kind });
      assert.equal(walk(tree).some(n => n.props?.className === 'study-v2-submission-status'), false);
      assert.deepEqual(ratings(tree).map(text), ratings(idle).map(text));
      assert.ok(ratings(tree).every(n => n.props.disabled));
      assert.equal(ratings(tree).filter(n => n.props['aria-pressed']).length, 1);
      const back = walk(tree).find(n => n.props?.className === 'study-v2-response-back');
      assert.equal(back.props.disabled, true);
      assert.equal(walk(tree).find(n => n.props?.className === 'study-v2-response-stage').props['aria-busy'], true);
      const statusNode = walk(tree).find(n => n.props?.role === 'status');
      assert.equal(statusNode.props.className, 'study-v2-sr-only');
      assert.match(text(statusNode), status === 'saving' ? /Submitting response/ : /Response saved/);
      assert.deepEqual(calls, [], 'Rendering cannot submit, advance or alter feedback');
    }
  });
}

test('failed acknowledgement keeps the original response frozen and offers only its safe retry', () => {
  const { tree, calls } = render('save-error');
  assert.match(text(tree), /Unable to confirm your answer was saved/);
  assert.ok(ratings(tree).every(n => n.props.disabled));
  const retry = walk(tree).find(n => n.type === 'button' && text(n) === 'Retry answer');
  retry.props.onClick(); assert.deepEqual(calls, [['save', 'easy']]);
});

test('next-card error explicitly confirms the save and retries only next selection', () => {
  const { tree, calls } = render('next-error');
  assert.match(text(tree), /Answer saved. Unable to load next card/);
  assert.equal(walk(tree).some(n => n.type === 'button' && text(n) === 'Retry answer'), false);
  walk(tree).find(n => n.type === 'button' && text(n) === 'Retry next card').props.onClick();
  assert.deepEqual(calls, [['next']]);
});

test('fresh ratings and Back remain enabled for both positive and negative feedback', () => {
  for (const feedback of ['up', 'down']) {
    const { tree } = render('idle', { feedback });
    assert.equal(ratings(tree).length, 3);
    assert.ok(ratings(tree).every(n => n.props.disabled === false));
    assert.equal(walk(tree).find(n => n.props?.className === 'study-v2-response-back').props.disabled, false);
  }
});
