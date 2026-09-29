import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
const source = readFileSync(new URL('../components/MarkdownContent.tsx', import.meta.url),'utf8');
const modules = { react: React, 'react/jsx-runtime': jsx, './MarkdownContent.module.css': {__esModule:true,default:{card:'card'}} };
const context = { exports:{}, URL, require(name) { assert.ok(name in modules, name); return modules[name]; } };
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,context);
const {MarkdownContent,cardMarkdownSummary} = context.exports;
const render = (markdown, props={mode:'card'}) => renderToStaticMarkup(React.createElement(MarkdownContent,{markdown,...props}));

test('default Concept renderer keeps released output including its unsupported syntax',()=>{
 for (const [input,expected] of [
  ['[safe](https://example.com)','<p>[safe](https://example.com)</p>'],
  ['> Quote','<p>&gt; Quote</p>'],
  ['**bold and *italic***','<p>*<em>bold and </em>italic***</p>'],
  ['first\nsecond','<p>first second</p>'],
  ['## Heading\n- A\n- B\n\n1. One\n2. Two','<h2>Heading</h2><ul><li>A</li><li>B</li></ul><ol><li>One</li><li>Two</li></ol>'],
 ]) assert.equal(render(input,{}),`<div class="article-body">${expected}</div>`);
 assert.doesNotMatch(source,/dangerouslySetInnerHTML/);
});

test('Card mode renders plain text, Unicode and line breaks without source rewriting',()=>{
 assert.equal(render('First & <second>\n雪 🧠'),'<div class="card"><p>First &amp; &lt;second&gt;\n雪 🧠</p></div>');
 assert.equal(render('one\n\ntwo'),'<div class="card"><p>one</p><p>two</p></div>');
});

test('nested emphasis, headings, flat lists and quotes render semantically',()=>{
 assert.match(render('**bold and *italic***'),/<strong>bold and <em>italic<\/em><\/strong>/);
 assert.match(render('*italic and **bold***'),/<em>italic and <strong>bold<\/strong><\/em>/);
 assert.match(render('***both***'),/<strong><em>both<\/em><\/strong>/);
 const html=render('## Title\n### Small\n- **A**\n- B\n\n1. One\n1. Two\n\n> Quote\n> **Strong**');
 for(const tag of ['h2','h3','ul','ol','blockquote']) assert.match(html,new RegExp(`<${tag}[ >]`));
 assert.match(html,/<li><strong>A<\/strong><\/li>/);
 assert.match(render('> > Nested'),/<blockquote><blockquote>/);
});

test('only explicit safe HTTP(S) links become anchors; disabled links and summaries never do',()=>{
 const text='[**Safe**](https://example.com/a_(b)?x=1&y=2)';
 assert.match(render(text),/<a href="https:\/\/example.com\/a_\(b\)\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer"><strong>Safe<\/strong><\/a>/);
 assert.doesNotMatch(render(text,{mode:'card',interactiveLinks:false}),/<a[ >]/);
 assert.equal(cardMarkdownSummary('## Title\n\n'+text+'\n\n- One\n- Two'),'Title Safe One Two');
 for(const url of ['http://example.com','HTTPS://example.com']) assert.match(render(`[ok](${url})`),/<a /);
 for(const url of ['javascript:alert(1)','data:text/html,<script>1</script>','//example.com','/relative','mailto:a@example.com','java\nscript:alert(1)','https://exa\u0000mple.com','https://example.com\\@evil.test','https&#58;//example.com','https://','https://exa mple.com']) {
  const raw=`[label](${url})`;assert.doesNotMatch(render(raw),/<a[ >]/,url);assert.equal(cardMarkdownSummary(raw),raw.replace(/\s+/g,' ').trim());
 }
});

test('hostile HTML stays escaped, malformed and unsupported Markdown stays visible',()=>{
 const html=render('<img src=x onerror=alert(1)>\n<script>alert(1)</script>');
 assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;script&gt;/);
 for(const raw of ['[broken](javascript:alert(1)','**unclosed','`code`','# unsupported heading','~~strike~~','![image](https://example.com/image.png)','[](https://example.com)']) assert.equal(cardMarkdownSummary(raw),raw);
 assert.equal(cardMarkdownSummary('\\*literal\\*'),' *literal*'.trim());
});

test('maximum Card content and adversarial input have bounded work and preserve text',()=>{
 for(const n of [10000,20000,65537]) { const raw='雪'.repeat(n);assert.equal(cardMarkdownSummary(raw),raw); }
 const adversarial='['.repeat(20000);assert.equal(cardMarkdownSummary(adversarial),adversarial);
 const nested=('> '.repeat(20))+'end';assert.match(cardMarkdownSummary(nested),/end$/);
 const longURL='https://example.com/'+ 'a'.repeat(19000);assert.match(render(`[link](${longURL})`),/<a /);
 const css=readFileSync(new URL('../components/MarkdownContent.module.css',import.meta.url),'utf8');
 assert.match(css,/overflow-wrap: anywhere/);assert.match(css,/white-space: pre-wrap/);
});
