import * as questionMedia from '../../lib/question-media.ts';
export { questionMedia };
export { hookHarness, loadConceptModule as loadQuestionModule, jsx, ids } from './concept-media-authoring.mjs';
export const passiveQuestionImages = () => ({
  dirty: false, guardActive: false, usesMedia: false, pending: false, uncertain: false, entered: false,
  items: [], context: null, inspector: null, error: '', reset() {}, open() {},
});
export const questionImageBoundary = { __esModule: true, default: function QuestionImageAuthoring() { return null; }, useQuestionImageAuthoring: passiveQuestionImages };
export const questionContentBoundary = { __esModule: true, default: function QuestionMediaContent() { return null; } };
export const questionIds = { draft: '11500000-0000-4000-8000-000000000001', question: '11500000-0000-4000-8000-000000000002', version: '11500000-0000-4000-8000-000000000003', asset: '11500000-0000-4000-8000-000000000004', placement: '11500000-0000-4000-8000-000000000005', reservation: '11500000-0000-4000-8000-000000000006' };
