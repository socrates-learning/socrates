import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const migration = readFileSync(new URL('../supabase/116_official_content_text_formats.sql', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../supabase/verify_116_official_content_text_formats.sql', import.meta.url), 'utf8');
const hash = value => createHash('sha256').update(value.trim()).digest('hex');
function body(name) {
  const start = migration.indexOf(`FUNCTION public.${name}(`);
  assert.ok(start >= 0, name);
  return migration.slice(start).split('AS $function$')[1].split('$function$')[0].trim();
}
function replace(value, from, to, count = 1) {
  assert.equal(value.split(from).length - 1, count, `Exact approved projection: ${from}`);
  return value.split(from).join(to);
}

test('116 adds only the five approved interpretation columns; no table, content backfill or HTML model', () => {
  const columns = [...migration.matchAll(/alter table public\.(\w+) add column (\w+) text not null default 'legacy'/g)].map(m => `${m[1]}.${m[2]}`);
  assert.deepEqual(columns, ['concepts.body_format', 'concept_versions.body_format', 'questions.prompt_format', 'question_versions.prompt_format', 'question_accepted_answers.answer_format']);
  assert.equal((migration.match(/check \(\w+ in \('legacy','visual_markdown_v1'\)\)/g) || []).length, 5);
  assert.doesNotMatch(migration, /create table|alter table.*drop|disable row level security|dangerouslySetInnerHTML/i);
  assert.match(migration, /'answer_format', qaa.answer_format/);
  assert.match(migration, /coalesce\(a->>'answer_format','legacy'\)/);
  assert.match(verifier, /No additional application table is authorized/);
});

test('Study selection algorithm is byte-identical to released d90c39e after projecting only format/version output columns', () => {
  let hardened = body('select_next_study_question_hardened');
  hardened = replace(hardened, 'question.prompt, question.prompt_format, question.current_version_id,', 'question.prompt,', 2);
  hardened = replace(hardened, 'select answer.answer_text, answer.answer_format', 'select answer.answer_text', 2);
  hardened = replace(hardened, 'accepted.answer_text as accepted_answer, accepted.answer_format as accepted_answer_format', 'accepted.answer_text as accepted_answer', 2);
  hardened = replace(hardened, "\n        'prompt_format', selected.prompt_format, 'answer_format', selected.accepted_answer_format, 'question_version_id', selected.current_version_id,", '', 2);
  assert.equal(hash(hardened), '016c7db9144489ee79265005f0ec1ef90429b59e642a3eaa324972af66841aad');
  let candidate = body('select_next_study_candidate');
  candidate = replace(candidate, "\n      'prompt_format', format_question.prompt_format, 'answer_format', format_answer.answer_format, 'question_version_id', format_question.current_version_id,", '');
  candidate = replace(candidate, '\n    join public.questions format_question on format_question.id=candidate.official_question_id\n    join lateral (select answer_format from public.question_accepted_answers where question_id=format_question.id order by sort_order,id limit 1) format_answer on true', '');
  candidate = replace(candidate, "\n      'prompt_format', selected_offer -> 'prompt_format', 'answer_format', selected_offer -> 'answer_format', 'question_version_id', selected_offer -> 'question_version_id',", '');
  assert.equal(hash(candidate), 'a1473388d3e59ddab266f07d777217c25ac64d3ec205fa24e8cc4df94bf2c45b');
});

test('private Concept cores preserve released save, placement, Tag, prerequisite and version algorithms', () => {
  assert.equal(hash(body('m116_concept_draft_core')), '2a6839255359eb04ca2558d5b94da5491f9cc672ee7cb9cb23f76871d1c34eb8');
  let version = replace(body('m116_concept_version_core'), 'public.m116_concept_draft_core(', 'public.save_concept_draft(');
  version = replace(version, '  update public.concepts set body_format=public.m116_format(p_body_format) where id=saved_concept_id;\n', '');
  assert.equal(hash(version), '6f5a5c6ebaf83c99898dfb417cb1ca8bf19883ecdd1700ff7ed673d165477ee3');
  let prerequisites = replace(body('m116_concept_with_prerequisites'), 'public.m116_concept_version_core(', 'public.save_concept_with_version(');
  prerequisites = replace(prerequisites, '    p_references, p_body_format\n', '    p_references\n');
  assert.equal(hash(prerequisites), '274342561b81fe06824c99c705df3f7117e507f5f6173f4f22fb92b034d34ad4');
});

test('private Question cores preserve released identity, answers, metadata, relationships, angles and version behavior', () => {
  assert.equal(hash(body('m116_update_question_core')), 'c41f373ed5debc976309e3ce6ed7861d29511e8f3dbf2c260b065741792d548d');
  let answers = replace(body('m116_replace_answers_core'), '      sort_order, answer_format\n', '      sort_order\n');
  answers = replace(answers, "      coalesce((answer_record ->> 'sort_order')::integer, 0),\n      public.m116_format(coalesce(answer_record->>'answer_format','legacy'))\n", "      coalesce((answer_record ->> 'sort_order')::integer, 0)\n");
  assert.equal(hash(answers), 'b0220091be3630d35dafc2284deebbce4c593c7eed10cdddf5632be3ba3cd2bb');
  let save = replace(body('m116_question_save_core'), 'public.m116_update_question_core(', 'public.update_question(', 2);
  save = replace(save, 'public.m116_replace_answers_core(', 'public.replace_question_accepted_answers(');
  save = replace(save, '  update public.questions set prompt_format=public.m116_format(p_prompt_format) where id=saved_question.id;\n', '');
  assert.equal(hash(save), '8416e3ec3a51fc548a4eebc96d7c1a8526e7c515dae3ca78cf3d7d522e1145bc');
});

test('Concept and Question media lifecycle code remains exact after narrow format/revision/call-boundary projection', () => {
  let concept = body('m114_save');
  concept = replace(concept, "\n perform public.m116_format(coalesce(p_payload->>'p_body_format','legacy'));\n if coalesce(p_payload->>'p_body_format','legacy')='legacy' then perform public.m116_legacy_concept(p_concept); end if;", '');
  concept = replace(concept, "\n  if p_payload?'p_body_format' and c.updated_at is distinct from (p_payload->>'p_expected_updated_at')::timestamptz then raise exception 'Concept changed; reload before saving' using errcode='40001'; end if;", '');
  concept = replace(concept, 'public.m116_concept_with_prerequisites(target,', 'public.save_concept_with_prerequisites(target,');
  concept = replace(concept, "p_payload->'p_references',p_payload->'p_prerequisites',coalesce(p_payload->>'p_body_format','legacy'));", "p_payload->'p_references',p_payload->'p_prerequisites');");
  assert.equal(hash(concept), 'fd2a4c3c185a54eef4c58146dcca63f99821e0d678d9ae991749d8ec78131d3d');
  let question = body('m115_save');
  question = replace(question, " if p_payload?'p_prompt_format' then\n  perform public.m116_question_context(p_library,p_payload,p_expected_version,(p_payload->>'p_expected_updated_at')::timestamptz);\n else perform public.m116_legacy_question(p_question,p_payload->'p_accepted_answers'); end if;\n", '');
  question = replace(question, 'public.m116_question_save_core(target,', 'public.save_question_with_relationships_v2(target,');
  question = replace(question, "jsonb_array_elements_text(p_payload->'p_additional_testing_angles')) end,coalesce(p_payload->>'p_prompt_format','legacy'));", "jsonb_array_elements_text(p_payload->'p_additional_testing_angles')) end);");
  assert.equal(hash(question), '0246fc3ece896fc3baca434e9bbd0c650ce0da0b6964bbc1724d47d1c045ec09');
});

test('format-aware saves explicitly preserve unexposed metadata, revision checks, shape and private core authority', () => {
  assert.match(migration, /q\.current_version_id is distinct from p_expected_version or q\.updated_at is distinct from p_expected_updated_at/);
  assert.match(migration, /row\(q\.concept_id,q\.question_type,q\.explanation,q\.review_article_concept_id,q\.sort_order,q\.difficulty,q\.status\)/);
  assert.match(migration, /jsonb_array_length\(p_payload->'p_accepted_answers'\)<>1/);
  assert.match(migration, /q\.prompt_format<>'legacy' or exists\(select 1 from public\.question_accepted_answers where question_id=q\.id and answer_format<>'legacy'\)/);
  assert.match(migration, /'review_article_concept_id','source_ids','status'/);
  assert.match(migration, /revoke all on function %s from public,anon,authenticated,service_role/);
  assert.doesNotMatch(migration, /set_config\([^;]*(?:bypass|format|authoring)/i);
});
