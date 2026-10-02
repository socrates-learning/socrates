-- Ordinary application lifecycle/authority regression, isolated media112 only.
-- No Storage writes, provider races or permission experiments; all changes roll back.
begin;
do $$ begin
 if current_database()<>'media112' or not exists(select 1 from public.libraries where id='11200000-0000-4000-8000-000000000010') then raise exception 'Disposable fixture required'; end if;
end $$;
do $$
declare
 a uuid:='11200000-0000-4000-8000-000000000001'; l uuid:='11200000-0000-4000-8000-000000000010'; c uuid:='11200000-0000-4000-8000-000000000030';
 r jsonb; first_claim jsonb; second_claim jsonb; s jsonb; p jsonb; destination jsonb; again jsonb; cleanup jsonb; denied boolean; phase integer; before_assets bigint;
 metadata jsonb:=jsonb_build_object('inputDigest',repeat('a',64),'outputDigest',repeat('b',64),'mime','image/png','size',100,'width',10,'height',10);
begin
 select count(*) into before_assets from public.media_assets;
 r:=public.m113_reserve(a,l,'concept',c,'11300000-0000-4000-8000-000000000001');
 if r is distinct from public.m113_reserve(a,l,'concept',c,'11300000-0000-4000-8000-000000000001') or r ? 'assetId' then raise exception 'Logical idempotency mismatch'; end if;
 if (select count(*) from public.media_assets)<>before_assets then raise exception 'Reservation allocated durable asset'; end if;
 first_claim:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'claim');
 denied:=false;
 begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'claim'); exception when lock_not_available then denied:=true; end;
 if not denied then raise exception 'Concurrent claim accepted'; end if;
 s:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'commit-bytes',(first_claim->>'token')::uuid,metadata);
 destination:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-stage',(first_claim->>'token')::uuid,s);
 if destination->>'object' not like '_staging/'||l::text||'/'|| (r->>'reservationId')||'/%' then raise exception 'Wrong staging identity'; end if;
 denied:=false;
 begin perform public.m113_delivery(a,l,(s->>'attemptId')::uuid); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Staging is deliverable'; end if;
 update public.media_service_operations set claim_expires_at=clock_timestamp()-interval '1 second' where id=(r->>'reservationId')::uuid;
 second_claim:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'claim');
 if (second_claim->>'generation')::bigint <= (first_claim->>'generation')::bigint then raise exception 'Generation not advanced'; end if;
 denied:=false;
 begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'stage-verified',(first_claim->>'token')::uuid,s); exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Stale worker mutated'; end if;
 again:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'commit-bytes',(second_claim->>'token')::uuid,metadata);
 if again=s then raise exception 'Retry reused attempt'; end if;
 if public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-stage',(second_claim->>'token')::uuid,again)=destination then raise exception 'Retry reused object'; end if;
 denied:=false;
 begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'commit-bytes',(second_claim->>'token')::uuid,metadata||jsonb_build_object('inputDigest',repeat('c',64))); exception when others then denied:=true; end;
 if not denied then raise exception 'Different bytes accepted'; end if;
 p:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'stage-verified',(second_claim->>'token')::uuid,again);
 destination:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-promotion',(second_claim->>'token')::uuid,p);
 denied:=false;
 begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-promotion',(second_claim->>'token')::uuid,p); exception when others then denied:=true; end;
 if not denied then raise exception 'Promotion dispatch reused'; end if;
 -- No object was uploaded: publication must roll back the asset and lease together.
 denied:=false;
 begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'publish',(second_claim->>'token')::uuid,p); exception when others then denied:=true; end;
 if not denied or (select count(*) from public.media_assets)<>before_assets then raise exception 'Unconfirmed publication was not atomic'; end if;
 perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'fail',(second_claim->>'token')::uuid);
 cleanup:=public.m113_cleanup((p->>'attemptId')::uuid,'temporary-claim');
 cleanup:=public.m113_cleanup((p->>'attemptId')::uuid,'temporary-observe',(cleanup->>'token')::uuid);
 if cleanup->>'cleaned'<>'false' or cleanup->>'unresolved'<>'true' then raise exception 'Uncertain dispatch claimed closure'; end if;
 first_claim:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'claim');
 s:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'commit-bytes',(first_claim->>'token')::uuid,metadata);
 perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-stage',(first_claim->>'token')::uuid,s);
 p:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'stage-verified',(first_claim->>'token')::uuid,s);
 if public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-promotion',(first_claim->>'token')::uuid,p)->>'object'=destination->>'object' then raise exception 'Uncertain promotion reused destination'; end if;
 perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'cancel');
 -- Cancel in each pre-publication state; no old token can continue or publish.
 for phase in 0..4 loop
  r:=public.m113_reserve(a,l,'concept',c,gen_random_uuid());
  first_claim:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'claim');
  if phase>=1 then s:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'commit-bytes',(first_claim->>'token')::uuid,metadata); end if;
  if phase>=2 then perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-stage',(first_claim->>'token')::uuid,s); end if;
  if phase>=3 then p:=public.m113_upload(a,l,(r->>'reservationId')::uuid,'stage-verified',(first_claim->>'token')::uuid,s); end if;
  if phase>=4 then perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'dispatch-promotion',(first_claim->>'token')::uuid,p); end if;
  perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'cancel');
  denied:=false;
  begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'publish',(first_claim->>'token')::uuid,p); exception when others then denied:=true; end;
  if not denied then raise exception 'Cancelled phase % published',phase; end if;
  denied:=false;
  begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'claim'); exception when others then denied:=true; end;
  if not denied then raise exception 'Cancelled phase % restarted',phase; end if;
 end loop;
 r:=public.m113_reserve(a,l,'question','11200000-0000-4000-8000-000000000040',gen_random_uuid());
 update public.media_service_operations set expires_at=clock_timestamp()-interval '1 second' where id=(r->>'reservationId')::uuid;
 denied:=false;
 begin perform public.m113_upload(a,l,(r->>'reservationId')::uuid,'claim'); exception when others then denied:=true; end;
 if not denied then raise exception 'Expired reservation claimed'; end if;
 denied:=false;
 begin perform public.m113_reserve('11200000-0000-4000-8000-000000000003',l,'concept',c,gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Learner official operation accepted'; end if;
 denied:=false;
 begin perform public.m113_reserve(a,l,'card',c,gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Personal attachment accepted'; end if;
 denied:=false;
 begin perform public.m113_reserve(a,'11200000-0000-4000-8000-000000000011','concept',c,gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Cross Library accepted'; end if;
 denied:=false;
 begin perform public.m113_upload('11200000-0000-4000-8000-000000000002',l,(r->>'reservationId')::uuid,'cancel'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Cross actor accepted'; end if;
 if (select count(*) from public.media_assets)<>before_assets then raise exception 'Lifecycle allocated unpublished assets'; end if;
end $$;
set local role authenticated;
do $$ declare denied boolean:=false; begin
 begin perform * from public.media_service_operations; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Browser table accessible'; end if;
 denied:=false;
 begin perform public.m113_cleanup(gen_random_uuid(),'claim'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Browser cleanup accessible'; end if;
end $$;
rollback;
