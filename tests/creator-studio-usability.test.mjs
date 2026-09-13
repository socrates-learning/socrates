import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const creatorSource = readFileSync(
  new URL('../components/CreatorStudioV2Client.tsx', import.meta.url),
  'utf8'
);
const creatorStyles = readFileSync(
  new URL('../components/CreatorStudioV2Client.module.css', import.meta.url),
  'utf8'
);
const creatorChromeSource = readFileSync(
  new URL('../components/creator/CreatorStudioChrome.tsx', import.meta.url),
  'utf8'
);
const studyPlannerSource = readFileSync(
  new URL('../components/StudyPlanner.tsx', import.meta.url),
  'utf8'
);
const homeStyles = readFileSync(new URL('../app/home.css', import.meta.url), 'utf8');
const headerSource = readFileSync(
  new URL('../components/Header.tsx', import.meta.url),
  'utf8'
);

test('Content keeps keyword search and adds Topic Tree browsing', () => {
  assert.match(creatorSource, /placeholder="Search concepts"/);
  assert.match(creatorSource, /<Folder size=\{17\} \/> Browse Concepts/);
  assert.match(creatorSource, /aria-label="Browse Concepts by Topic"/);
  assert.match(creatorSource, /aria-controls="question-concept-browser"/);
  assert.match(creatorSource, /id="question-concept-browser"/);
  assert.match(creatorSource, /renderConceptBrowseTopic/);
  assert.match(creatorSource, /questionConceptsByTopicId\[topic\.id\]/);
  assert.match(creatorSource, /openConceptFromSearch\(conceptOption\.id\)/);
});

test('Question authoring keeps the linked Concept and Topic path visible', () => {
  assert.match(creatorSource, /aria-label="Primary Concept"/);
  assert.match(
    creatorSource,
    /Primary Concept: \{editingQuestionPrimary\?\.name \|\| linkedQuestionConcept\.name\}/
  );
  assert.match(
    creatorSource,
    /path\.map\(\(topic\) => topic\.name\)\.join\(' › '\)/
  );
  assert.match(creatorSource, /selectQuestionConcept\(/);
  assert.match(creatorStyles, /\.linkedConceptContext/);
});

test('Creator Studio stays authoring-only while Stats owns Algorithm diagnostics', () => {
  assert.match(creatorSource, /<CreatorStudioTabs/);
  assert.match(creatorChromeSource, /\{ id: 'content', label: 'Content' \}/);
  assert.match(creatorChromeSource, /\{ id: 'questions', label: 'Questions' \}/);
  assert.match(creatorChromeSource, /\{ id: 'tags', label: 'Tags' \}/);
  assert.doesNotMatch(creatorSource, /CreatorAlgorithmDiagnostics/);
  assert.match(studyPlannerSource, /import\('\.\/CreatorAlgorithmDiagnostics'\)/);
  assert.match(studyPlannerSource, /'progress', 'history'/);
  assert.match(studyPlannerSource, /canViewAlgorithmDiagnostics/);
  assert.match(studyPlannerSource, /#stats-algorithm/);
  assert.match(studyPlannerSource, /mode !== 'stats'/);
  assert.match(studyPlannerSource, /home-v2-shell-stats/);
  assert.match(homeStyles, /\.home-v2-shell-stats\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});

function compileCreatorChrome() {
  const compiled = ts.transpileModule(creatorChromeSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const context = {
    exports: {},
    require(name) {
      if (name === 'react/jsx-runtime') {
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      }
      if (name === '../CreatorStudioV2Client.module.css') {
        return { default: {} };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

test('extracted tabs and save toolbar remain controlled and dispatch once', () => {
  const chrome = compileCreatorChrome();
  const selected = [];
  const tabs = chrome.CreatorStudioTabs({
    activeTab: 'questions',
    onSelect: (tab) => selected.push(tab),
  });
  const tabButtons = tabs.props.children;
  assert.equal(tabButtons.length, 3);
  assert.equal(
    Array.from(tabButtons, (button) => button.props['aria-selected']).join(','),
    'false,true,false'
  );
  tabButtons[2].props.onClick();
  assert.deepEqual(selected, ['tags']);

  let saves = 0;
  const toolbar = chrome.CreatorStudioSaveToolbar({
    buttonLabel: 'Save Question',
    disabled: false,
    message: 'Question workspace',
    onSave: () => { saves += 1; },
  });
  const saveButton = toolbar.props.children[1];
  saveButton.props.onClick();
  assert.equal(saves, 1);
  assert.equal(saveButton.props.disabled, false);
});

test('global and in-page Home navigation resolve to the canonical dashboard', () => {
  assert.match(headerSource, /href="\/"[\s\S]*?onClick=\{handleHomeClick\}/);
  assert.match(studyPlannerSource, /const pathname = usePathname\(\)/);
  assert.match(
    studyPlannerSource,
    /useEffect\(\(\) => \{\s*if \(pathname !== '\/'\) return;[\s\S]*?function openModeFromHash\(\)/
  );
  assert.match(
    studyPlannerSource,
    /\}, \[canViewAlgorithmDiagnostics, pathname\]\);/
  );
  assert.match(
    studyPlannerSource,
    /function handleHomeClick[\s\S]*?window\.history\.pushState\([\s\S]*?window\.location\.pathname \+ window\.location\.search[\s\S]*?setMode\('dashboard'\)/
  );
});
