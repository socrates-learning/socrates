# Batch Concept Imports

Batch seeds must create concepts through `public.import_seed_concept`. The
function rejects source-less imports, reuses `sources` by stable `source_key`,
and creates concept-level rows in `content_source_notes` atomically.

```sql
select public.import_seed_concept(
  jsonb_build_object(
    'name', 'Example Concept',
    'concept_type', 'Drug Class',
    'importance', 'High',
    'difficulty', 'Intermediate',
    'estimated_time', '15 min',
    'summary', 'Example summary.',
    'why_it_matters', 'Example rationale.',
    'created_by', '<editor-user-id>',
    'is_public', true,
    'status', 'published'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'source_key', 'guideline:example-2026',
      'title', 'Example Clinical Guideline',
      'author', 'Example Organization',
      'source_type', 'government',
      'url', 'https://example.org/guideline',
      'license', 'Public domain',
      'note', 'Supports the overview and treatment recommendations.'
    )
  )
);
```

Use the same `source_key` in later calls to attach that source to additional
concepts. Source metadata is updated in place instead of creating duplicates.
Placements, article sections, and relationships can be inserted after the
function returns the concept UUID.

Existing seed batches are backfilled by `013_backfill_seed_sources.sql`. It
reuses sources by canonical URL and uses conflict-safe attachments, so
rerunning it does not duplicate sources or concept attribution. When migration
`012` is present, its source-key trigger also assigns canonical keys.
