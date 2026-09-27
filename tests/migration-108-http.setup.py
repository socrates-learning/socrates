"""Disposable LOCAL ONLY integration fixture for migration-108-http.test.mjs.
Usage: python3 tests/migration-108-http.setup.py
       SOCRATES_108_HTTP=1 node --test tests/migration-108-http.test.mjs
       python3 tests/migration-108-http.setup.py --cleanup
Requires the established local socrates-current-db PG17.6 baseline and Docker.
Never uses Supabase CLI, Management API, remote URLs, or Production credentials.
"""
import subprocess,json,uuid,secrets,sys,tempfile
from pathlib import Path
R=Path(__file__).resolve().parents[1];O=Path(tempfile.gettempdir())/'socrates108';O.mkdir(exist_ok=True)
DB='socrates108_validation'
CMD=['docker','exec','-i','socrates-current-db','psql','-X','-U','postgres','-d',DB,'-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose']
if '--cleanup' in sys.argv:
 subprocess.run(['docker','stop','socrates108-rest'],check=True,capture_output=True)
 subprocess.run(['docker','rm','socrates108-rest'],check=True,capture_output=True)
 subprocess.run(['docker','exec','socrates-current-db','dropdb','-U','postgres',DB],check=True)
 subprocess.run(['docker','exec','socrates-current-db','psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-c','DROP ROLE m108_probe_login;'],check=True,capture_output=True)
 O.joinpath('jwt-secret').unlink(missing_ok=True)
 print('Exact disposable test service, database, and login role removed.');sys.exit(0)
# Fail closed on an existing target; never overwrite an existing fixture.
subprocess.run(['docker','exec','socrates-current-db','createdb','-U','postgres','-T','socrates_current',DB],check=True)
def q(s):return "'"+str(s).replace("'","''")+"'"
def arr(xs):return 'ARRAY['+','.join(q(x)+'::uuid' for x in xs)+']::uuid[]'
def run(s,check=True):
 p=subprocess.run(CMD,input=s,text=True,capture_output=True)
 if check:assert p.returncode==0,p.stderr
 return p

def fixture():
 x={k:str(uuid.uuid4()) for k in ['staff','learner','lib','root','p','q','a','b','c','d','pr','pr2','pa','pb','pc','pd']}
 s=f"BEGIN;INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) VALUES({q(x['staff'])},'authenticated','authenticated',{q(x['staff']+'@example.invalid')},'','{{}}','{{}}'),({q(x['learner'])},'authenticated','authenticated',{q(x['learner']+'@example.invalid')},'','{{}}','{{}}');INSERT INTO public.user_roles(user_id,role) VALUES({q(x['staff'])},'admin'),({q(x['learner'])},'learner');"
 s+=f"INSERT INTO public.libraries(id,name,slug,status) VALUES({q(x['lib'])},'Concurrency',{q(x['lib'])},'active');INSERT INTO public.library_nodes(id,library_id,parent_id,name,node_type) VALUES({q(x['root'])},{q(x['lib'])},null,'Root','section');"
 for i,k in enumerate(['p','q']):s+=f"INSERT INTO public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) VALUES({q(x[k])},{q(x['lib'])},{q(x['root'])},{q(k.upper())},'topic',{i});"
 for i,k in enumerate(['a','b','c','d']):s+=f"INSERT INTO public.library_nodes(id,library_id,parent_id,name,node_type,sort_order) VALUES({q(x[k])},{q(x['lib'])},{q(x['p'])},{q(k.upper())},'topic',{i});"
 s+=f"INSERT INTO public.user_libraries(user_id,library_id,assigned_by) VALUES({q(x['learner'])},{q(x['lib'])},{q(x['staff'])});"
 for i,k in enumerate(['pr','pr2']):s+=f"INSERT INTO public.personal_topics(id,owner_id,parent_id,name,sort_order) VALUES({q(x[k])},{q(x['learner'])},null,{q(k)},{i});"
 for i,k in enumerate(['pa','pb','pc','pd']):s+=f"INSERT INTO public.personal_topics(id,owner_id,parent_id,name,sort_order) VALUES({q(x[k])},{q(x['learner'])},{q(x['pr'])},{q(k)},{i});"
 run(s+'COMMIT;');return x


for n in ['105','107','106','104']:run(next((R/'supabase').glob(n+'_*.sql')).read_text())
O.joinpath('functions-before.json').write_text(run("SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',p.proowner::regrole::text,'acl',p.proacl::text)) FROM pg_proc p WHERE pronamespace='public'::regnamespace;").stdout)
x=fixture();O.joinpath('http-fixture.json').write_text(json.dumps(x))
run("CREATE SCHEMA m108_probe; CREATE SEQUENCE m108_probe.executions; GRANT USAGE ON SCHEMA m108_probe TO authenticated; GRANT USAGE,SELECT ON SEQUENCE m108_probe.executions TO authenticated;")
run((R/'supabase/108_topic_stale_conflict_errors.sql').read_text())
secret=secrets.token_hex(32);O.joinpath('jwt-secret').write_text(secret);O.joinpath('jwt-secret').chmod(0o600)
password=secrets.token_hex(24)
sql=f"CREATE ROLE m108_probe_login LOGIN NOINHERIT PASSWORD '{password}'; GRANT authenticated,anon TO m108_probe_login;"
p=subprocess.run(['docker','exec','-i','socrates-current-db','psql','-X','-U','supabase_admin','-d',DB,'-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True);assert not p.returncode,p.stderr
info=json.loads(subprocess.check_output(['docker','inspect','socrates-current-db']))[0];ip=info['NetworkSettings']['Networks']['bridge']['IPAddress']
args=['docker','run','-d','--name','socrates108-rest','-p','127.0.0.1:3108:3000','-e',f'PGRST_DB_URI=postgres://m108_probe_login:{password}@{ip}:5432/{DB}','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET='+secret,'public.ecr.aws/supabase/postgrest:v14.5']
p=subprocess.run(args,capture_output=True,text=True);assert not p.returncode,p.stderr
print('Disposable PG17.6 / PostgREST14.5 fixture ready on loopback port 3108.')
