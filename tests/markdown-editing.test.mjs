import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { applyMarkdownEdit } from '../lib/markdown-editing.ts';
// Captured from released d5fb394 before extraction, never calculated from the helper.
const frozen = [
  {
    "format": "bold",
    "source": "Before selected after",
    "start": 7,
    "end": 15,
    "expected": {
      "source": "Before **selected** after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        17
      ]
    }
  },
  {
    "format": "bold",
    "source": "Before after",
    "start": 7,
    "end": 7,
    "expected": {
      "source": "Before **bold text**after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        18
      ]
    }
  },
  {
    "format": "bold",
    "source": "Start one\n\ntwo End",
    "start": 6,
    "end": 14,
    "expected": {
      "source": "Start **one\n\ntwo** End",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        8,
        16
      ]
    }
  },
  {
    "format": "italic",
    "source": "Before selected after",
    "start": 7,
    "end": 15,
    "expected": {
      "source": "Before *selected* after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        8,
        16
      ]
    }
  },
  {
    "format": "italic",
    "source": "Before after",
    "start": 7,
    "end": 7,
    "expected": {
      "source": "Before *italic text*after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        8,
        19
      ]
    }
  },
  {
    "format": "italic",
    "source": "Start one\n\ntwo End",
    "start": 6,
    "end": 14,
    "expected": {
      "source": "Start *one\n\ntwo* End",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        7,
        15
      ]
    }
  },
  {
    "format": "heading",
    "source": "Before selected after",
    "start": 7,
    "end": 15,
    "expected": {
      "source": "Before ## selected after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        10,
        18
      ]
    }
  },
  {
    "format": "heading",
    "source": "Before after",
    "start": 7,
    "end": 7,
    "expected": {
      "source": "Before ## Headingafter",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        10,
        17
      ]
    }
  },
  {
    "format": "heading",
    "source": "Start one\n\ntwo End",
    "start": 6,
    "end": 14,
    "expected": {
      "source": "Start ## one\n## Heading\n## two End",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        30
      ]
    }
  },
  {
    "format": "bulleted-list",
    "source": "Before selected after",
    "start": 7,
    "end": 15,
    "expected": {
      "source": "Before - selected after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        17
      ]
    }
  },
  {
    "format": "bulleted-list",
    "source": "Before after",
    "start": 7,
    "end": 7,
    "expected": {
      "source": "Before - Itemafter",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        13
      ]
    }
  },
  {
    "format": "bulleted-list",
    "source": "Start one\n\ntwo End",
    "start": 6,
    "end": 14,
    "expected": {
      "source": "Start - one\n- Item\n- two End",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        8,
        24
      ]
    }
  },
  {
    "format": "numbered-list",
    "source": "Before selected after",
    "start": 7,
    "end": 15,
    "expected": {
      "source": "Before 1. selected after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        10,
        18
      ]
    }
  },
  {
    "format": "numbered-list",
    "source": "Before after",
    "start": 7,
    "end": 7,
    "expected": {
      "source": "Before 1. Itemafter",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        10,
        14
      ]
    }
  },
  {
    "format": "numbered-list",
    "source": "Start one\n\ntwo End",
    "start": 6,
    "end": 14,
    "expected": {
      "source": "Start 1. one\n1. Item\n1. two End",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        27
      ]
    }
  },
  {
    "format": "link",
    "source": "Before selected after",
    "start": 7,
    "end": 15,
    "expected": {
      "source": "Before [selected](https://example.com) after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        8,
        16
      ]
    }
  },
  {
    "format": "link",
    "source": "Before after",
    "start": 7,
    "end": 7,
    "expected": {
      "source": "Before [link text](https://example.com)after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        8,
        17
      ]
    }
  },
  {
    "format": "link",
    "source": "Start one\n\ntwo End",
    "start": 6,
    "end": 14,
    "expected": {
      "source": "Start [one\n\ntwo](https://example.com) End",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        7,
        15
      ]
    }
  },
  {
    "format": "quote",
    "source": "Before selected after",
    "start": 7,
    "end": 15,
    "expected": {
      "source": "Before > selected after",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        17
      ]
    }
  },
  {
    "format": "quote",
    "source": "Before after",
    "start": 7,
    "end": 7,
    "expected": {
      "source": "Before > Quoteafter",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        9,
        14
      ]
    }
  },
  {
    "format": "quote",
    "source": "Start one\n\ntwo End",
    "start": 6,
    "end": 14,
    "expected": {
      "source": "Start > one\n> Quote\n> two End",
      "status": null,
      "mode": "write",
      "deferred": true,
      "focus": true,
      "range": [
        8,
        25
      ]
    }
  }
];
for (const f of frozen) test(`released Concept insertion: ${f.format} ${f.start}:${f.end} ${JSON.stringify(f.source)}`, () => {
  const next = applyMarkdownEdit(f.source, f.start, f.end, f.format);
  assert.equal(next.source, f.expected.source);
  assert.deepEqual([next.selectionStart, next.selectionEnd], f.expected.range);
  const source = readFileSync(new URL('../components/CreatorStudioV2Client.tsx', import.meta.url), 'utf8');
  const start = source.indexOf('  function applyMarkdownFormat(');
  const handler = source.slice(start, source.indexOf('\n  function openAddDialog()', start));
  const calls = []; let queued;
  const editor = { selectionStart: f.start, selectionEnd: f.end, focus() { calls.push('focus'); }, setSelectionRange(...range) { calls.push(range); } };
  const context = { applyMarkdownEdit, concept: f.source, conceptEditorRef: { current: editor },
    setConcept(value) { calls.push(['source',value]); }, setStatus(value) { calls.push(['status',value]); },
    setEditorMode(value) { calls.push(['mode',value]); }, window: { requestAnimationFrame(fn) { queued = fn; } } };
  vm.runInNewContext(ts.transpileModule(handler+`\napplyMarkdownFormat(${JSON.stringify(f.format)});`, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, context);
  assert.deepEqual(calls, [['source',f.expected.source],['status',null],['mode','write']]);
  assert.equal(typeof queued, 'function'); queued();
  assert.deepEqual(calls.slice(-2), ['focus',f.expected.range]);
});
