'use server';

import { createSupabaseServerClient } from '@/lib/supabase-server';
import { resolveActiveLibraryContext } from '@/lib/library-context';

// This read-only entry gate is narrower than the legacy Concept save permissions.
// Do not change those permissions as part of navigation.
export async function authorizeConceptNavigation(input: {
  conceptId: string;
  questionId: string | null;
  libraryId: string;
}): Promise<boolean> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!input || !uuid.test(input.conceptId) || !uuid.test(input.libraryId) ||
    (input.questionId !== null && !uuid.test(input.questionId))) return false;
  try {
    const db = await createSupabaseServerClient();
    const { data: auth, error } = await db.auth.getUser();
    if (error || !auth.user) return false;
    const [role, active] = await Promise.all([
      db.from('user_roles').select('role').eq('user_id', auth.user.id).maybeSingle(),
      db.rpc('account_is_active'),
    ]);
    if (role.error || active.error || role.data?.role !== 'admin' || active.data !== true) return false;
    const context = await resolveActiveLibraryContext({ failOnQueryError: true });
    if (context.user?.id !== auth.user.id || context.role !== 'admin' ||
      context.isUnauthorized || context.library?.id !== input.libraryId ||
      context.library.status !== 'active') return false;
    const placement = await db.from('concept_placements')
      .select('concept_id, concepts!inner(id), library_nodes!inner(library_id)')
      .eq('concept_id', input.conceptId)
      .eq('library_nodes.library_id', input.libraryId).limit(1).maybeSingle();
    if (placement.error || placement.data?.concept_id !== input.conceptId) return false;
    if (input.questionId) {
      const question = await db.from('questions').select('id, concept_id')
        .eq('id', input.questionId).maybeSingle();
      if (question.error || question.data?.id !== input.questionId) return false;
      if (question.data.concept_id !== input.conceptId) {
        const primaryPlacement = await db.from('concept_placements').select('concept_id, library_nodes!inner(library_id)')
          .eq('concept_id', question.data.concept_id).eq('library_nodes.library_id', input.libraryId).limit(1).maybeSingle();
        if (primaryPlacement.error || primaryPlacement.data?.concept_id !== question.data.concept_id) return false;
        const related = await db.from('question_related_concepts').select('concept_id')
          .eq('question_id', input.questionId).eq('concept_id', input.conceptId).maybeSingle();
        if (related.error || related.data?.concept_id !== input.conceptId) return false;
      }
    }
    return true;
  } catch {
    // Never disclose database details or hydrate a fallback record.
    return false;
  }
}
