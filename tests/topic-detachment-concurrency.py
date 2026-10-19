"""Synthetic local-only lock/conflict proof; never connects to a hosted database."""
import argparse,json,re,subprocess,time
p=argparse.ArgumentParser();p.add_argument('--container',required=True);p.add_argument('--database',required=True);a=p.parse_args()
assert re.fullmatch(r'socrates-[a-z0-9-]+',a.container)
assert re.fullmatch(r'topic_detachment_proof_[0-9]+',a.database)
cmd=['docker','exec','-i',a.container,'psql','-XqAt','-U','postgres','-d',a.database,'-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
def run(s):return subprocess.run(cmd,input=s,text=True,capture_output=True,timeout=20)
def read(s):
 r=run(s);assert not r.returncode,r.stderr;return r.stdout.strip().splitlines()[-1]
def id(n):return f'12200000-0000-4000-8000-{n:012d}'
def q(s):return "'"+str(s).replace("'","''")+"'"
lib=q(id(10));admin=id(1);learner=id(2)
def actor(u):return f"select set_config('request.jwt.claim.sub',{q(u)},true);set local role authenticated;"
def call(s,u=admin):return read(f'begin;{actor(u)}{s};commit;')
def rev():return call(f"select public.get_official_topic_graph({lib})->>'revision'")
def create(name):return json.loads(call(f"select public.create_official_topic_at_location({lib},{q(id(26))},{q(name)},'this',{q(rev())})"))['location_id']
def review(loc):return call(f"select public.review_official_topic_detachment({lib},{q(loc)})->>'review_revision'")
def detach(loc,token):return f"select public.detach_official_topic_location({lib},{q(loc)},{q(token)});"
assert read("select count(*)>0 and bool_and(email like 'zz-shared122-%@example.invalid') from auth.users")=='t'
results=[]
def race(label,user_a,first_sql,user_b,second_sql,error):
 first=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 first.stdin.write(f"begin;{actor(user_a)}{first_sql}select 'HELD';select pg_sleep(0.7);commit;\n");first.stdin.close()
 while True:
  line=first.stdout.readline()
  if line.strip()=='HELD':break
  if not line:raise AssertionError(first.stderr.read())
 start=time.monotonic();second=run(f'begin;{actor(user_b)}{second_sql}commit;');first.wait(timeout=10)
 assert first.returncode==0,first.stderr.read()
 assert second.returncode!=0 and error in second.stderr,(label,second.stderr)
 elapsed=time.monotonic()-start;assert elapsed>.4,(label,elapsed)
 results.append({'check':label,'rejected_sqlstate':error,'serialized_seconds':round(elapsed,3)})
loc=create('Race removal');token=review(loc)
race('double removal cannot act on stale retained placement',admin,detach(loc,token),admin,detach(loc,token),'22023')
loc2=create('Race moved location');token=review(loc2)
race('concurrent move invalidates reviewed removal',admin,f"select public.change_official_topic_location({lib},{q(loc2)},{q(id(24))},'move','this',false,null,{q(rev())});",admin,detach(loc2,token),'PT409')
loc3=create('Race owner anchor');token=review(loc3)
card=lambda loc,n: f"insert into public.personal_cards(id,owner_id,library_id,library_node_id,question,answer) values({q(id(n))},{q(learner)},{lib},{q(loc)},'Synthetic race Card','Synthetic');"
race('new personal anchor invalidates reviewed removal',learner,card(loc3,180),admin,detach(loc3,token),'PT409')
assert json.loads(call(f"select public.review_official_topic_detachment({lib},{q(loc3)})"))['blocked_by_personal_anchor']
loc4=create('Race late owner anchor');token=review(loc4)
race('late personal attachment cannot target detached original',admin,detach(loc4,token),learner,card(loc4,181),'23514')
assert read(f"select count(*) from public.personal_cards where id={q(id(181))}")=='0'
r=rev();reassign=f"select public.reassign_official_topic({lib},{q(loc4)},{q(id(24))},{q(r)});"
race('concurrent reassignment creates exactly one active location',admin,reassign,admin,reassign,'PT409')
assert read(f"select count(*) from public.official_topic_locations where topic_id={q(loc4)} and detached_at is null")=='1'
print(json.dumps({'passed':len(results),'checks':results},indent=2))
