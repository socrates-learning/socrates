import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studyAdvice,requireAdvisor} from '../lib/study-advisor.ts';
import {topic,evidence,goal,goals} from './fixtures/study-advisor.mjs';

test('retention explains actual reviewed-item difficulty, why and advisory slider action',()=>{
 const a=studyAdvice(evidence(),null);assert.equal(a.length,1);assert.equal(a[0].kind,'retention');assert.match(a[0].observed,/10 of 20/);assert.match(a[0].action,/toward Mastery/);assert.match(a[0].action,/50\/100/);assert.match(a[0].action,/resets its descendants/);
});
for(const [key,value] of Object.entries({observation_days:6,study_days:2,review_days:2,review_responses:11,repeated_lapse_items:2,review_lapses:7}))test(`retention withholds advice below ${key} threshold`,()=>assert.deepEqual(studyAdvice(evidence([topic({[key]:value})]),null),[]));
test('retention at exact conservative thresholds is recognized',()=>assert.equal(studyAdvice(evidence([topic({observation_days:7,study_days:3,review_days:3,review_responses:15,review_lapses:6})]),null)[0].kind,'retention'));
test('no recommendation to exceed fully Mastery setting; unselected Topics do not get slider instructions',()=>{
 for(const patch of [{balance:100},{selected:false},{balance:null}]) {const a=studyAdvice(evidence([topic(patch)]),null)[0];assert.equal(a.kind,'retention');assert.doesNotMatch(a.action,/consider moving/i);}
});
const coverage = patch => topic({balance:80,review_lapses:5,repeated_lapse_items:0,...patch});
test('review-heavy low coverage with eligible unseen material suggests considering New',()=>{
 const a=studyAdvice(evidence([coverage()]),null)[0];assert.equal(a.kind,'coverage');assert.match(a.observed,/22 eligible items remain/);assert.match(a.action,/toward New/);assert.match(a.why,/cannot prove why/);
});
for(const patch of [{selected:false},{balance:64},{responses:19},{new_items:3},{review_responses:18},{total_items:12},{observation_days:6}])test(`coverage conservative gate ${JSON.stringify(patch)}`,()=>assert.ok(!studyAdvice(evidence([coverage(patch)]),null).some(a=>a.kind==='coverage')));
test('retention takes precedence for same Topic, shared material and ancestor/descendant Topics',()=>{
 const a=studyAdvice(evidence([topic({related_keys:['official:other','official:root']}),coverage({key:'official:other',name:'Other'}),coverage({key:'official:root',name:'Parent'})]),null);assert.deepEqual(a.map(x=>x.kind),['retention']);
});
test('canonical Topic identity and shared material deduplicate advice, deterministically',()=>{
 const a=topic(),b=topic({key:'official:other',related_keys:['official:leaf']});
 assert.deepEqual(studyAdvice(evidence([a,b]),null),studyAdvice(evidence([b,a]),null));assert.equal(studyAdvice(evidence([a,b]),null).length,1);
 assert.throws(()=>requireAdvisor(evidence([a,a]),'library','learner'),/invalid Topic/);
});
test('personal Topic identity is source qualified and can receive retention advice',()=>assert.equal(studyAdvice(evidence([topic({key:'personal:leaf',source:'personal'})]),null)[0].id,'retention:personal:leaf'));
test('deadline uses Goal Dates forecast; trial increase is modest and timing is evidence based',()=>{
 const a=studyAdvice(evidence([]),goals())[0];assert.equal(a.kind,'deadline');assert.match(a.observed,/2.1 per day/);assert.match(a.why,/70 responses per day/);assert.match(a.action,/3 responses per day \(roughly 3 minutes/);assert.match(a.action,/not enough/);assert.match(a.action,/do not add overlapping/);
});
test('overlapping and disjoint behind goals yield one prioritized deadline, never summed workload',()=>{
 const g=goal(),g2=goal({id:'g2',name:'Quiz',official_topic_ids:['root','leaf']}),g3=goal({id:'g3',name:'Other subject',official_topic_ids:['other']});
 const a=studyAdvice(evidence([]),goals([g3,g2,g]));assert.equal(a.length,1);assert.equal(a[0].id,'deadline:g1');assert.match(a[0].observed,/2 other goals/);assert.match(a[0].why,/70 responses/);
});
test('unsupported history, unavailable scope, complete and overdue goals do not invent pace advice',()=>{
 for(const g of [goal({unavailable_topics:1}),goal({deadline:'2026-10-10'}),goal({progress:{...goal().progress,recent_coverage_gain:2}}),goal({progress:{...goal().progress,covered_items:40}})])assert.deepEqual(studyAdvice(evidence([]),goals([g])),[]);
});
test('mastery advice retains cohort qualification and withholds unsupported time estimates',()=>{
 const g=goal({objective:'mastery',progress:{...goal().progress,timed_sessions:2}});const a=studyAdvice(evidence([]),goals([g]))[0];assert.match(a.why,/cohort may not represent/);assert.doesNotMatch(a.action,/minutes/);
});
test('wrong-Library or stale-day goal snapshots cannot produce deadline advice',()=>{
 for(const patch of [{library_id:'other'},{today:'2026-10-10'}])assert.deepEqual(studyAdvice(evidence([]),{...goals(),...patch}),[]);
});
test('healthy recall requires sufficient distinct review evidence; does not assert mastery',()=>{
 const a=studyAdvice(evidence([topic({review_lapses:3,repeated_lapse_items:0})]),null)[0];assert.equal(a.kind,'healthy');assert.match(a.observed,/17 of 20/);assert.match(a.why,/not proof of permanent mastery/);
 assert.deepEqual(studyAdvice(evidence([topic({review_lapses:3,repeated_lapse_items:0,reviewed_items:4})]),null),[]);
});
test('healthy message cannot override a supported behind-deadline warning',()=>assert.deepEqual(studyAdvice(evidence([topic({review_lapses:3,repeated_lapse_items:0})]),goals()).map(a=>a.kind),['deadline']));
test('supported Goal pace can provide positive status without inventing recall or achievements',()=>{
 const g=goal({deadline:'2027-12-31'}),a=studyAdvice(evidence([]),goals([g]))[0];assert.equal(a.kind,'healthy');assert.match(a.observed,/5 of 40/);assert.match(a.action,/not a guarantee/);assert.doesNotMatch(a.observed,/mastered/);
 const m=studyAdvice(evidence([]),goals([goal({deadline:'2027-12-31',objective:'mastery'})]))[0];assert.match(m.why,/limited mastery cohort/);
});
test('empty history and inconclusive patterns produce no speculative recommendation',()=>{assert.deepEqual(studyAdvice(evidence([]),null),[]);assert.deepEqual(studyAdvice(evidence([topic({review_lapses:5,repeated_lapse_items:1})]),null),[]);});
test('advice generation never mutates goals, evidence, or preference values',()=>{
 const e=evidence(),g=goals(),before=JSON.stringify([e,g]);studyAdvice(e,g);assert.equal(JSON.stringify([e,g]),before);
});
test('reader validation fails closed on account, Library, malformed counts and incompatible version',()=>{
 assert.equal(requireAdvisor(evidence(),'library','learner').topics.length,1);
 for(const patch of [{actor_id:'other'},{library_id:'other'},{version:2},{topics:null},{as_of:'broken'}])assert.throws(()=>requireAdvisor({...evidence(),...patch},'library','learner'));
 for(const patch of [{review_lapses:21},{total_items:1},{new_items:9},{repeated_lapse_items:6},{balance:101},{responses:NaN},{observation_days:29}])assert.throws(()=>requireAdvisor(evidence([topic(patch)]),'library','learner'));
});
test('migration is a new stable read-only RPC; released goals and scheduler contracts are not replaced',()=>{
 const sql=readFileSync(new URL('../supabase/124_read_only_study_advisor.sql',import.meta.url),'utf8');
 assert.equal((sql.match(/create function /gi)||[]).length,1);assert.match(sql,/stable security definer set search_path='' set timezone='UTC'/);
 assert.match(sql,/m123_require_library\(p_library_id\)/);assert.match(sql,/m117_preference_state\(deck_id\)/);assert.match(sql,/where a.user_id=u/g);
 assert.doesNotMatch(sql,/\b(insert into|update public|delete from|create table|create policy|alter table|create or replace)\b/i);
 assert.match(sql,/first_at::date<a.created_at::date reviewed/);assert.match(sql,/count\(distinct created_at::date\)>=2/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
});
