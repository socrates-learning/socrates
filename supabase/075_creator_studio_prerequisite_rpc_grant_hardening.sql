-- Harden Migration 074 prerequisite RPC execution privileges after Supabase's
-- automatic function grants. Preserve postgres and service_role access.

begin;

revoke all on function public.get_concept_prerequisites(uuid)
  from public, anon, authenticated;
revoke all on function public.save_concept_with_prerequisites(
  uuid, text, text, uuid, uuid[], uuid[], text, jsonb, jsonb
)
  from public, anon, authenticated;
revoke all on function public.sync_concept_prerequisites(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.reject_concept_prerequisite_cycle()
  from public, anon, authenticated;

grant execute on function public.get_concept_prerequisites(uuid)
  to authenticated;
grant execute on function public.save_concept_with_prerequisites(
  uuid, text, text, uuid, uuid[], uuid[], text, jsonb, jsonb
)
  to authenticated;

commit;
