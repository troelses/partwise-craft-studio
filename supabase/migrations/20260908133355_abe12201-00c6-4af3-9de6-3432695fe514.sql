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