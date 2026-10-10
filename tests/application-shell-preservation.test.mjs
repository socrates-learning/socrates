import ts from 'typescript';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
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

// The original complete style fingerprints remain authoritative. Only these
// explicitly pinned append-only presentation blocks are excluded from them.
const contentPresentationStyles = {
  "app/home.css": {
    "marker": "\n\n/* Home dashboard:",
    "sha256": "7e2a967b9eb575ca71837eed4b30082691d3b57a1ef5b809e45029b0998e97c3"
  },
  "components/CreatorStudioV2Client.module.css": {
    "marker": "\n/* Approved Content-first navy presentation.",
    "sha256": "67aa07003435e5f27ed0652857abf86ec0362034ed97adc5cc3135ac1ebc53e0"
  }
};

// Frozen from f901e28 before shell implementation, never generated at test runtime.
const released = {'app/home.css': '08156337bbef31e0e99d08e415f5ec9265f26ed728f9499ad38aa16f49810c1b', 'components/CreatorStudioV2Client.module.css': '7d8215e58235d411ed70e2276b9e66edd66024949993a8026a9b614a56c86a89', 'components/ResetStudyProgress.tsx': 'e13f916e07046f419ab65b2f11834959b0fc657fad253eb6a025123d92ea30b5', 'components/LibrarySwitcher.tsx': 'dd407828cf4a1aa321b49f65ad13ea6dfd5ba6c5e54d5800564cefd9a41122dc', 'app/library/switch/route.ts': '166e238406ce3ec1a4e4c11bb25adc87b1f9504262aa2aef8a5650f77bffe2c6', 'app/library/clear/route.ts': '6ddcb5dc67979a07e39597b34bdc93b7cdff87e63af7fcbda60cc6c4b7be8075', 'components/study-planner/StudyModeStyles.tsx': '90c8b25a21f5ae637217e0e1c5e17c0b2b60fb319c99906d46ea28a57aa5e281'};
for (const [path, expected] of Object.entries(released)) test(`excluded workspace behavior/styles preserve original fingerprints: ${path}`, () => {
  let source = read(path);
  if (path === 'components/CreatorStudioV2Client.module.css') {
    const marker = '\n/* Interaction states are scoped';
    assert.equal(source.split(marker).length, 2);
    assert.equal(hash(source.slice(source.indexOf(marker))), '3344d02e22aff599d212bcc01508eee1ef197e1016933c51dc656074029cd018', 'Exact approved hover, selected, focus, disabled and sticky-header offset additions');
    source = source.slice(0, source.indexOf(marker));
  }
  if (path in contentPresentationStyles) {
    const { marker, sha256 } = contentPresentationStyles[path];
    assert.equal(source.split(marker).length, 2);
    const start = source.indexOf(marker);
    assert.equal(hash(source.slice(start)), sha256, 'Only the exact reviewed presentation block');
    source = source.slice(0, start);
  }
  if (path === 'components/study-planner/StudyModeStyles.tsx') {
    assert.equal(source.split(approvedTypography).length - 1, 1, 'Only the exact approved Front typography block is projected');
    source = source.replace(approvedTypography, '');
    const approvedFront = `        .study-v2-question-content {
          animation: study-v2-content-in 200ms ease-out;
          display: flex;
          flex: 1;
          flex-direction: column;
          justify-content: safe center;`;
    assert.equal(source.split(approvedFront).length - 1, 1, 'Only the exact approved Front alignment declaration is projected');
    source = source.replace(approvedFront, approvedFront.replace('justify-content: safe center;', 'justify-content: center;'));
  }
  assert.equal(hash(source), expected);
});

test('Account retains its existing content, native Library switch and destructive-reset boundary', () => {
  const account = read('app/account/page.tsx'), reset = read('components/ResetStudyProgress.tsx');
  for (const label of ['Account Settings', 'Account details', 'Accessible Libraries', 'Back to Home']) assert.ok(account.includes(label));
  assert.match(account, /<LibrarySwitcher context=\{context\} returnTo="\/account"/);
  assert.match(account, /<ResetStudyProgress/);
  assert.match(reset, /supabase\.rpc\('reset_study_progress'/);
  assert.match(reset, /Historical attempts were preserved/);
  assert.match(reset, /onClick=\{confirmReset\}/);
  const library = read('components/LibrarySwitcher.tsx');
  assert.match(library, /action="\/library\/switch"/); assert.match(library, /method="post"/);
  assert.match(library, /defaultValue=\{context\.library\?\.slug \|\| ''\}/);
});
test('Original Home styles remain exact beneath the approved dashboard block and Creator overrides remain scoped', () => {
  const home = read('app/home.css'), creator = read('components/CreatorStudioV2Client.module.css');
  assert.match(home, /grid-template-columns: 376px minmax\(0, 1fr\)/);
  assert.match(home, /min-height: calc\(100vh - 140px\)/);
  assert.match(home, /socrates-header-mountains\.jpg/);
  assert.match(creator, /minmax\(330px, 0.82fr\) minmax\(560px, 1.18fr\)/);
  assert.match(creator, /@media \(max-width: 1120px\)/);
});
test('active Study/Cram matches the released branch after projecting only approved media presentation and has no application rail', () => {
  const planner = read('components/StudyPlanner.tsx');
  const a = planner.indexOf("  if (mode === 'study') {", planner.indexOf('if (!deck)'));
  const b = planner.indexOf('\n  return (\n    <>\n      <LearnerHeader classPrefix="home-v2"', a);
  assert.ok(a >= 0 && b > a);
  const study = planner.slice(a,b);
  const mediaReview = '<ConceptMediaContent markdown={conceptReview.bodyMarkdown} format={conceptReview.bodyFormat} conceptId={conceptReview.conceptId} libraryId={activeLibrary?.id} />';
  assert.equal(study.split(mediaReview).length - 1, 1, 'Exactly the approved Concept Review body receives actual Concept and Library context');
  let releasedStudy = study.replace(mediaReview, '<MarkdownContent markdown={conceptReview.bodyMarkdown} />');
  const adaptiveFront = '<div className="study-v2-question-content" data-front-size={getStudyFrontSize(studyCandidate)}';
  assert.equal(study.split(adaptiveFront).length - 1, 1, 'Only the existing Front receives the current candidate sizing band');
  releasedStudy = releasedStudy.replace(adaptiveFront, '<div className="study-v2-question-content"');
  // Project only the three explicit official text alternatives; Card and legacy branches stay frozen.
  const officialText = [
  [
    "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null\n                    ? <MarkdownContent markdown={studyCandidate.prompt} mode=\"card\" interactiveLinks={false} />\n                    : studyCandidate?.kind === 'official' && questionMarkdownKind(studyCandidate.prompt, studyCandidate.promptFormat) === 'block'\n                      ? <>\n                        <h1 className=\"study-v2-sr-only\">Question</h1>\n                        <MarkdownContent markdown={studyCandidate.prompt} mode=\"question\" format={studyCandidate.promptFormat} interactiveLinks={false} />\n                      </>\n                      : <h1 style={studyCandidate?.kind === 'official' && studyCandidate.mediaHint?.front ? { margin: '0 auto', flexShrink: 0 } : undefined}>{studyCandidate?.kind === 'official' ? <MarkdownContent markdown={studyCandidate.prompt} mode=\"question\" format={studyCandidate.promptFormat} interactiveLinks={false} /> : studyCandidate?.prompt}</h1>}",
    "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null\n                    ? <MarkdownContent markdown={studyCandidate.prompt} mode=\"card\" interactiveLinks={false} />\n                    : <h1 style={studyCandidate?.kind === 'official' && studyCandidate.mediaHint?.front ? { margin: '0 auto', flexShrink: 0 } : undefined}>{studyCandidate?.prompt}</h1>}"
  ],
  [
    "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null ? <>\n                        <h2 id=\"study-revealed-question-heading\" className=\"study-v2-sr-only\">{studyCandidate.prompt}</h2>\n                        <MarkdownContent markdown={studyCandidate.prompt} mode=\"card\" />\n                      </> : studyCandidate?.kind === 'official' && questionMarkdownKind(studyCandidate.prompt, studyCandidate.promptFormat) === 'block' ? <>\n                        <h2 id=\"study-revealed-question-heading\" className=\"study-v2-sr-only\">Question</h2>\n                        <MarkdownContent markdown={studyCandidate.prompt} mode=\"question\" format={studyCandidate.promptFormat} />\n                      </> : studyCandidate?.kind === 'official' && questionMarkdownKind(studyCandidate.prompt, studyCandidate.promptFormat) === 'inline' ? <h2 id=\"study-revealed-question-heading\">\n                        <MarkdownContent markdown={studyCandidate.prompt} mode=\"question\" format={studyCandidate.promptFormat} />\n                      </h2> : <h2 id=\"study-revealed-question-heading\">\n                        {studyCandidate?.prompt}\n                      </h2>}",
    "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null ? <>\n                        <h2 id=\"study-revealed-question-heading\" className=\"study-v2-sr-only\">{studyCandidate.prompt}</h2>\n                        <MarkdownContent markdown={studyCandidate.prompt} mode=\"card\" />\n                      </> : <h2 id=\"study-revealed-question-heading\">\n                        {studyCandidate?.prompt}\n                      </h2>}"
  ],
  [
    "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null\n                        ? <MarkdownContent markdown={studyAnswer ?? ''} mode=\"card\" />\n                        : studyCandidate?.kind === 'official' && questionMarkdownKind(studyAnswer ?? '', studyCandidate.answerFormat) === 'block'\n                          ? <MarkdownContent markdown={studyAnswer ?? ''} mode=\"question\" format={studyCandidate.answerFormat} />\n                          : <p>{studyCandidate?.kind === 'official' ? <MarkdownContent markdown={studyAnswer ?? ''} mode=\"question\" format={studyCandidate.answerFormat} /> : studyAnswer}</p>}",
    "studyCandidate?.kind === 'personal' && studyCandidate.personalConceptId === null\n                        ? <MarkdownContent markdown={studyAnswer ?? ''} mode=\"card\" />\n                        : <p>{studyAnswer}</p>}"
  ]
];
  for (const [expression, before] of officialText) {
    assert.equal(study.split(expression).length - 1, 1, 'Exactly the approved official text expression');
    releasedStudy = releasedStudy.replace(expression, before);
  }
  const richFront = "studyCandidate?.kind === 'official' && (studyCandidate.mediaHint?.front || questionMarkdownKind(studyCandidate.prompt, studyCandidate.promptFormat) === 'block')";
  assert.equal(study.split(richFront).length - 1, 1, 'Only official rich blocks gain top alignment');
  releasedStudy = releasedStudy.replace(richFront, "studyCandidate?.kind === 'official' && studyCandidate.mediaHint?.front");
  for (const [surface, count] of [['front', 2], ['answer', 1]]) {
    const expression = `{studyCandidate?.kind === 'official' && <QuestionMediaContent questionId={studyCandidate.questionId} hint={studyCandidate.mediaHint} surface="${surface}" prompt={studyCandidate.prompt} answer={studyCandidate.answer} presentation="study" />}`;
    assert.equal(study.split(expression).length - 1, count, 'Only the three approved, actual-candidate image siblings are projected');
    releasedStudy = releasedStudy.split('\n').filter(line => line.trim() !== expression).join('\n');
  }
  const front = '<div className="study-v2-question-content" style={studyCandidate?.kind === \'official\' && studyCandidate.mediaHint?.front ? { justifyContent: \'flex-start\' } : undefined}>';
  const heading = '<h1 style={studyCandidate?.kind === \'official\' && studyCandidate.mediaHint?.front ? { margin: \'0 auto\', flexShrink: 0 } : undefined}>{studyCandidate?.prompt}</h1>';
  for (const expression of [front, heading]) assert.equal(releasedStudy.split(expression).length - 1, 1, 'Only the exact official-media Front alignment is projected');
  assert.ok(releasedStudy.indexOf(front) > releasedStudy.indexOf(') : !isAnswerVisible ? ('));
  assert.ok(releasedStudy.indexOf(heading) < releasedStudy.indexOf('className="study-v2-answer-body"'));
  releasedStudy = releasedStudy.replace(front, '<div className="study-v2-question-content">').replace(heading, '<h1>{studyCandidate?.prompt}</h1>');
  assert.equal(hash(releasedStudy), 'a66d35e0842261e8a458ebffeacc0a70120710c7d3d250588d2ed10248a88048');
  assert.doesNotMatch(study, /HomeRail|SocratesShell|ApplicationNavigation/);
});

const studyFunctionHashes = {
  "ensureStudySessionWithCandidate": "3089faea910ea558de263075f44029f5476deeebf9686b861dedbfba27ac0663",
  "resetStudyCardFeedback": "100900d6b9b858c67f218bf0582dd49a99ceaf93d455ab2ced45893125f0f43a",
  "openStudyCardMorePanel": "7c751f9da330bc4d3695acfdb58d05b046ff15e395e9b1062d994f488d804cb1",
  "closeStudyCardMorePanel": "88637fe85486b4a4d35d7a754f2942872cd3cea3024c6abd9e00ff4e67257578",
  "returnToStudyQuestion": "df4f233d159e3040296c80b0f28df4eb568e43809bdec44a1619396e53d0b8a1",
  "loadStudyConceptReview": "3e737bfcf771b15c93d8c8514173fc236790936de35148398ca027da3e468fd9",
  "openStudyConceptReview": "ea447ea477a604c5fb62edf6a5ad8d07c5d64a7e8b4695f367d905caf880d931",
  "submitStudyCardFeedback": "3de162716cdf5971f613f4c820ceb8bcdb7528db85cfb2bd7de1f96494fe0918",
  "openFlagModal": "0ea72566959ada2154e04c57088f30014fbb63bd4b64bc946312916fc7d5a675",
  "saveCandidateFlag": "19ce8bf8ca047594c010b0495b88b34397d9f43986270c6555878446b7867d0c",
  "removeCandidateFlag": "20b01000605db0e53d3037d1fede37336369069c5586d64eabe77cc235cf0b8c",
  "openStudyMode": "035b69d2d4135fabb71bdb3ec49f0de4aaa01f334fa5efc798319790db71c4a4",
  "leaveStudyMode": "97e9b79a13f95524ccfc251f217ac38bf7e6fed87a0b86e95c8f1f0a74b5592b",
  "loadNextStudyCard": "8ab3b3eeff59f5cb314ce8479a1a2f5606073e86300a0a5562854dd128d5a867",
  "retryNextStudyCard": "07bd183c28f6aa8df9beda6917a407b2e62b05586604ac62cdd7c415479e531b",
  "persistFinalStudyResponse": "4e21c7af978e5b954364d2afb611a39175a50fd13e398155d45e3dc1214dd832",
  "toggleSetupCramMode": "3d97365b808b291b4f19ab3b710305d2b0243e7d1323a5ba58568b1c29f0074d"
};
test('Study/Cram launch, session, delivery, response, Exit, Flag and Concept Review owners are unchanged', () => {
  const source = read('components/StudyPlanner.tsx');
  const ast = ts.createSourceFile('StudyPlanner.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = {};
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text in studyFunctionHashes) found[node.name.text] = hash(node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.deepEqual(found, studyFunctionHashes);
});

test('reset requires explicit confirmation; failed RPC retains dialog and does not refresh', async () => {
  const { default: vm } = await import('node:vm');
  const source = read('components/ResetStudyProgress.tsx');
  const a = source.indexOf('  function openConfirmation()'), b = source.indexOf('\n  return (', a);
  assert.ok(a >= 0 && b > a);
  const compiled = ts.transpileModule(source.slice(a,b).replace(/  (async )?function /g, 'export $1function '), { compilerOptions: {module:ts.ModuleKind.CommonJS} }).outputText;
  for (const failure of [false,true]) {
    const calls = [], exports = {};
    const context = { exports, canOpen:true, selectedTarget:{id:'concept'}, library:{id:'library'}, requestId:'request', scope:'concept', conceptId:'concept', topicId:'topic', isResetting:false,
      crypto:{randomUUID:()=> 'request'}, setError:x=>calls.push(['error',x]),setSummary:x=>calls.push(['summary',x]),setRequestId:x=>calls.push(['request',x]),setIsDialogOpen:x=>calls.push(['dialog',x]),setIsResetting:x=>calls.push(['busy',x]),
      dialogRef:{current:{showModal:()=>calls.push(['open']),close:()=>calls.push(['close'])}},router:{refresh:()=>calls.push(['refresh'])},
      supabase:{rpc:async(name,payload)=>{calls.push(['rpc',name,JSON.parse(JSON.stringify(payload))]);return failure?{error:{message:'offline'}}:{data:{concepts_reset:1},error:null};}},
    };
    vm.runInNewContext(compiled,context);exports.openConfirmation();assert.equal(calls.filter(c=>c[0]==='rpc').length,0);
    exports.closeConfirmation();assert.equal(calls.filter(c=>c[0]==='rpc').length,0);calls.length=0;
    await exports.confirmReset();assert.deepEqual(calls.find(c=>c[0]==='rpc'),['rpc','reset_study_progress',{p_library_id:'library',p_request_id:'request',p_scope:'concept',p_target_id:'concept'}]);
    assert.equal(calls.filter(c=>c[0]==='refresh').length,failure?0:1);assert.equal(calls.filter(c=>c[0]==='close').length,failure?0:1);
  }
});


test('Home-only layout and redundant header action preserve every released planner byte after exact projection', () => {
  let source = read('components/StudyPlanner.tsx');
  const homeHeader = `<LearnerHeader classPrefix="home-v2" brandHref="/" onHomeClick={handleHomeClick} items={mode === 'dashboard' ? items.filter(item => item.label !== 'Home') : items} />`;
  assert.equal(source.split(homeHeader).length, 2, 'Only dashboard mode omits the redundant header Home action');
  source = source.replace(homeHeader, '<LearnerHeader classPrefix="home-v2" brandHref="/" onHomeClick={handleHomeClick} items={items} />');
  const marker = ` data-home-dashboard={mode === 'dashboard' ? '' : undefined}`;
  const accessibleTree = `                  className="home-v2-setup-tree"
                  aria-label="Home deck settings Topic Tree"
                  role="region"
                  tabIndex={0}`;
  assert.equal(source.split(marker).length, 2, 'Only dashboard mode opts into height allocation; Stats does not');
  assert.equal(source.split(accessibleTree).length, 2, 'The existing tree wrapper is a labelled keyboard-focusable region');
  source = source.replace(marker, '').replace(accessibleTree, `                  className="home-v2-setup-tree"
                  aria-label="Home deck settings Topic Tree"`);
  assert.equal(hash(source), '2a604d4926d98db0edb7f86d5ac8dbacf95fffde2e6cb4b1b00a3536783704ae', 'All existing Topic rows, selections, sliders, Library, Stats and Study behavior remains byte-identical');
});
