// Opt-in integration against the disposable local PostgreSQL/PostgREST 14.5 fixture.
// Never accepts a remote URL or an arbitrary database target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const enabled = process.env.SOCRATES_108_HTTP === '1';
const dir = join(tmpdir(), 'socrates108');
function sql(query) {
  return execFileSync('docker', ['exec','-i','socrates-current-db','psql','-X','-U','postgres','-d','socrates108_validation','-At','-v','ON_ERROR_STOP=1'], {input:query,encoding:'utf8'}).trim();
}
function token(sub) {
  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
  const body = `${enc({alg:'HS256',typ:'JWT'})}.${enc({sub,role:'authenticated',exp:Math.floor(Date.now()/1000)+600})}`;
  return `${body}.${createHmac('sha256',readFileSync(`${dir}/jwt-secret`,'utf8')).update(body).digest('base64url')}`;
}
for (const code of ['PT409','P0001']) for (const kind of ['official','personal']) {
  test(`${code}: ${kind} stale RPC executes once and leaves no state or lock`, {skip:!enabled,timeout:10000}, async () => {
    const x = JSON.parse(readFileSync(`${dir}/http-fixture.json`));
    const definitions = JSON.parse(readFileSync(`${dir}/functions-before.json`));
    const signature = Object.keys(definitions).find(k=>k.startsWith(kind==='official'?'position_library_node_in_library(':'position_personal_topic('));
    const baseline = definitions[signature].definition;
    const original = sql(`SELECT pg_get_functiondef('public.${signature}'::regprocedure);`);
    assert.equal(original, baseline.replace(/(raise exception 'Stale[^']*' using errcode=)'40001'/g, "$1'PT409'").trim(), 'exact Migration 108 candidate must be installed');
    const patched = original.replace(/(raise exception 'Stale[^']*' using errcode=)'PT409'/g,`$1'${code}'`)
      .replace('\nbegin\n',"\nbegin\n perform nextval('m108_probe.executions');\n");
    sql((kind==='personal'?'SET ROLE socrates_migrator;':'')+patched+"; RESET ROLE; ALTER SEQUENCE m108_probe.executions RESTART WITH 1;");
    const snapshot = () => sql("SELECT md5(jsonb_build_object('nodes',(SELECT jsonb_agg(t ORDER BY id) FROM public.library_nodes t),'personal',(SELECT jsonb_agg(t ORDER BY id) FROM public.personal_topics t),'placements',(SELECT jsonb_agg(t ORDER BY id) FROM public.personal_topic_official_placements t))::text);");
    const before = snapshot(); let requests = 0;
    const sub = kind==='official'?x.staff:x.learner;
    const client = createClient('http://127.0.0.1:3108','local-test-key',{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${token(sub)}`}, fetch:(url,options)=>{
        requests++; const target = new URL(url); assert.equal(target.origin,'http://127.0.0.1:3108');
        target.pathname=target.pathname.replace(/^\/rest\/v1/,'');
        return fetch(target, {...options,signal:AbortSignal.timeout(3000)});
      }}
    });
    const args = kind==='official'?{
      p_library_id:x.lib,p_topic_id:x.c,p_expected_parent_id:x.p,p_destination_parent_id:x.p,p_before_sibling_id:x.a,
      p_expected_source_ids:[x.c,x.a,x.b,x.d],p_expected_destination_ids:[x.c,x.a,x.b,x.d]
    }:{p_topic_id:x.pc,p_expected_parent_id:x.pr,p_destination_parent_id:x.pr,p_expected_official_node_id:null,p_destination_official_node_id:null,p_before_sibling_id:x.pa,
      p_expected_source_ids:[x.pc,x.pa,x.pb,x.pd],p_expected_destination_ids:[x.pc,x.pa,x.pb,x.pd]};
    try {
      const start=performance.now();const result=await client.rpc(signature.split('(')[0],args);const durationMs=performance.now()-start;
      assert.equal(result.status,code==='PT409'?409:400,JSON.stringify(result));assert.equal(result.error?.code,code);assert.match(result.error.message,/Stale .*source/);
      assert.equal(requests,1);assert.equal(sql("SELECT last_value::text || ':' || is_called::text FROM m108_probe.executions;"),'1:true');assert.ok(durationMs<3000);assert.equal(snapshot(),before);
      assert.equal(sql("SELECT count(*) FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND locktype='advisory' AND classid=104 AND objid=20260927;"),'0');
      const active = () => sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'PostgREST%' AND state<>'idle';");
      const deadline=performance.now()+1000; while(active()!=='0' && performance.now()<deadline) await new Promise(resolve=>setTimeout(resolve,20));
      assert.equal(active(),'0');
      console.log(JSON.stringify({code,kind,requests,databaseExecutions:1,durationMs,status:result.status,error:result.error,unchanged:true,activeTransactions:0,locks:0}));
    } finally { sql((kind==='personal'?'SET ROLE socrates_migrator;':'')+original+'; RESET ROLE;'); }
  });
}
