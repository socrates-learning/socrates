import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {projectSharedTopicSource} from './fixtures/shared-topic-branches.mjs';
import {loadOfficialTopicGraph} from '../lib/topic-placement-graph.ts';
import {graphFixture} from './fixtures/shared-topic-branches.mjs';
const hash = x => createHash('sha256').update(x).digest('hex');
const released = {
  "components/CreatorStudioV2Client.tsx": "f90020cad0f8d329ceb3fc09f9220bb21a7f113e5ee8786a75768c23b1456816",
  "components/StudyPlanner.tsx": "221c413591d5bce38b1d957d7874aabd352452fb09deeef099a7523b98833378"
};
for (const [path, fingerprint] of Object.entries(released)) test(`only exact shared-placement additions are projected from ${path}`,()=>{
 const source=readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
 assert.equal(hash(projectSharedTopicSource(path,source)),fingerprint);
 assert.notEqual(hash(projectSharedTopicSource(path,source+'\n// unrelated edit\n')),fingerprint);
 assert.throws(()=>projectSharedTopicSource(path,source.replace('occurrenceKey','unapprovedKey')));
});
test('graph access requires an authenticated successful response bound to the requested Library',async()=>{
 const g=graphFixture(), calls=[];
 assert.equal(await loadOfficialTopicGraph({rpc:async(name,args)=>{calls.push({name,args});return {data:g,error:null};}},'library'),g);
 assert.deepEqual(calls,[{name:'get_official_topic_graph',args:{p_library_id:'library'}}]);
 await assert.rejects(loadOfficialTopicGraph({rpc:async()=>({data:g,error:{message:'Denied'}})},'library'),/Denied/);
 await assert.rejects(loadOfficialTopicGraph({rpc:async()=>({data:g,error:null})},'foreign'),/Library/);
 await assert.rejects(loadOfficialTopicGraph({rpc:async()=>({data:null,error:null})},'library'),/Library/);
});
