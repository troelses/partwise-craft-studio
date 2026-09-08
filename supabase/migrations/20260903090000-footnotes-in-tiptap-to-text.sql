-- Make footnote text reachable by full-text search and by Ask AI.
--
-- Footnotes are stored on a footnote node as attrs.note = [{t, m?, href?}].
-- The keys are deliberately `t`/`m`/`href` and never `text`, so the previous
-- flattener — which harvests every value keyed `text` at any depth via
-- `strict $.**.text` — ignored footnotes entirely. That was on purpose: it let
-- footnotes ship and be approved without silently corrupting search before this
-- migration existed.
--
-- This migration turns that visibility on, with two changes that must stay
-- together in one file:
--
--   1. tiptap_to_text now appends footnote bodies after the body text, under a
--      label. They are appended rather than harvested in place because a note
--      taken at its anchor lands in the middle of the sentence it hangs off,
--      which reads as corruption both in the tsvector and in what
--      get_document_text hands the model verbatim.
--
--   2. REINDEX. The function is IMMUTABLE and document_sections_published_fts_idx
--      is a functional GIN index over it, so Postgres does not re-evaluate
--      existing rows when the definition changes. Without the reindex the index
--      keeps values that no longer match the function and searches return wrong
--      results with no error at all. Demonstrated on PostgreSQL 16: searching a
--      footnote-only term against the stale index returns 0 rows, and 1 row after
--      reindexing.
--
-- The marker is "[FN: ...]" rather than a Danish word. A label like
-- "[Fodnoter:" stems to 'fodnot' in the danish text-search config, so every
-- section containing any footnote would match a search for "fodnote" — a false
-- positive nobody asked for. Verified: with the Danish label a search for
-- "fodnote" matched a document that merely HAS a footnote; with "FN" it does
-- not, and 'fn' collides with nothing in ordinary Danish prose.
--
-- Notes are labelled but NOT numbered. This function sees one section's jsonb,
-- while the application numbers footnotes continuously across the whole
-- document, and a functional index requires a pure function of a single row — so
-- a document-wide number cannot be computed here. A section-local number would
-- contradict the number the user sees on screen, which is worse than none.
--
-- Signature, language and volatility are unchanged, so the index and the three
-- RPCs that call this (count_documents_containing, search_documents,
-- get_document_text) all pick the new behaviour up without being touched.

create or replace function public.tiptap_to_text(doc jsonb)
returns text
language sql
immutable
parallel safe
as $$
  -- Ordering is explicit everywhere below. string_agg without ORDER BY has no
  -- guaranteed order, and an immutable function backing an index must return
  -- the same string on a fresh evaluation as the one stored in the index.
  with body as (
    select coalesce(string_agg(v.t, ' ' order by v.ord), '') as s
    from jsonb_array_elements_text(
           jsonb_path_query_array(doc, 'strict $.**.text')
         ) with ordinality as v(t, ord)
  ),
  note_texts as (
    -- attrs.note of every node whose type is "footnote", in document order.
    --
    -- The type filter matters: a bare `strict $.**.note` would harvest ANY key
    -- named `note` anywhere in the tree — an image's alt text, or anything a
    -- future .docx import happens to emit — and render it as a footnote.
    --
    -- Only a string `t` is taken. jsonb's ->> stringifies whatever it finds, so
    -- without the type guard a numeric or object `t` from imported junk would
    -- inject raw JSON into both the search index and the model's context.
    select n.ord,
           btrim((
             select string_agg(r.run ->> 't', '' order by r.ord)
             from jsonb_array_elements(n.note) with ordinality as r(run, ord)
             where jsonb_typeof(r.run -> 't') = 'string'
           )) as txt
    from jsonb_array_elements(
           jsonb_path_query_array(
             doc, 'strict $.**?(@.type == "footnote").attrs.note')
         ) with ordinality as n(note, ord)
    -- Defensive: never let a malformed note abort the function. This backs an
    -- index, so an exception here would block writes to document_sections, not
    -- merely break search.
    where jsonb_typeof(n.note) = 'array'
  ),
  notes as (
    select coalesce(string_agg(txt, ' | ' order by ord), '') as s
    from note_texts
    where txt is not null and txt <> ''
  )
  select case
           when notes.s = '' then body.s
           when body.s  = '' then '[FN: ' || notes.s || ']'
           else body.s || ' [FN: ' || notes.s || ']'
         end
  from body, notes;
$$;

-- Inseparable from the change above. Plain REINDEX (not CONCURRENTLY) is used
-- deliberately: it runs inside the transaction a migration is wrapped in. It
-- takes a brief exclusive lock on the index while it rebuilds.
reindex index public.document_sections_published_fts_idx;
