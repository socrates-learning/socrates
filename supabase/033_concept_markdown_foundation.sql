-- Concept Markdown storage foundation.
-- Existing concepts retain all current content and receive an empty Markdown body.

alter table public.concepts
  add column if not exists body_markdown text not null default '';
