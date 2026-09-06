import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildConceptTopicTree } from '../lib/concept-topic-tree.ts';

for (const route of ['new','[id]']) {
 for (const library of ['nursing','medicine']) {
  test(`${route} Concept route uses shared ${library} context and scopes placements`,async () => {
   const calls=[];
   const database={from(table){
    const query={select(){return query;},eq(column,value){calls.push([table,column,value]);return query;},in(column,value){calls.push([table,column,value]);return query;},is(){return query;},order(){return query;},maybeSingle(){return query;},then(resolve){
     const data=table==='libraries'?{id:library,library_nodes:[{id:`${library}-topic`,name:library,parent_id:null,sort_order:0}]}:table==='concepts'?{id:'concept',name:'Example',body_markdown:'Body'}:[];
     return Promise.resolve({data,error:null}).then(resolve);
    }};return query;
   }};
   const exports={};
   const modules={
    'next/navigation':{notFound(){throw Error('404');},redirect(){throw Error('redirect');}},
    '@/components/CreatorStudioV2Client':{CreatorStudioV2Client:'editor'},
    '@/lib/concept-topic-tree':{buildConceptTopicTree},
    '@/lib/library-context':{resolveActiveLibraryContext:async()=>({library:{id:library}})},
    '@/lib/supabase-server':{createSupabaseServerClient:async()=>database},
    'react/jsx-runtime':{jsx:(_type,props)=>props},
   };
   const source=readFileSync(new URL(`../app/creator/concepts/${route}/page.tsx`,import.meta.url),'utf8');
   vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:name=>modules[name]});
   const result=await exports.default({params:Promise.resolve({id:'concept'})});
   assert.equal(result.activeLibraryId,library);
   assert.equal(result.initialTopics[0].id,`${library}-topic`);
   assert.ok(calls.some(([table,column,value])=>table==='libraries'&&column==='id'&&value===library));
   assert.ok(!calls.some(([,column])=>column==='slug'));
   if(route==='[id]') assert.ok(calls.some(([table,column,value])=>table==='concept_placements'&&column==='library_nodes.library_id'&&value===library));
  });
 }
}
