-- Make kerneopgaver reachable by search and by Ask AI.
--
-- Stage D of docs/kerneopgaver-approval-scope.md. Requires the publish columns
-- (20260917090000) and approve_document (20260918090000).
--
-- Until now all three RPCs joined document_sections alone and read
-- published_content alone, so section 2.2 was invisible to every one of them.
-- Across the 13 real documents that is 58% of the text.
--
-- Three things happen here:
--
--   1. A labels table, so the Danish subsection names have ONE home. Without it
--      the labels would live in SQL as well as in src/constants/kerneopgaver.ts,
--      and adding a seventh subsection would be two silent edits — exactly the
--      trap Ambulant set the first time.
--   2. The three RPCs gain kerneopgave branches, including the item titles, so
--      searching for a kerneopgave by name works whether or not the words appear
--      in its body text.
--   3. Two new GIN indexes. Both are NEW, so unlike 20260903090000 there is no
--      stale-index hazard and no REINDEX: entries cannot disagree with the
--      function when none exist yet.
--
-- Only published_content is read, so nothing appears to search or to the model
-- until it has been approved. That is the same rule ordinary sections follow.

-- 1. Labels -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kerneopgave_section_labels (
  section_type TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  position     INTEGER NOT NULL
);

INSERT INTO public.kerneopgave_section_labels (section_type, label, position) VALUES
  ('almenmedicinske_tilbud', 'Almenmedicinske tilbud',             10),
  ('speciallaegepraksis',    'Speciallægepraksis',                 20),
  ('sygehus',                'Sygehus',                            30),
  ('ambulant',               'Ambulant',                           40),
  ('faellesopgaver',         'Fællesopgaver med andre specialer',  50),
  ('fremtidig_varetagelse',  'Fremtidig varetagelse',              60)
ON CONFLICT (section_type) DO UPDATE
  SET label = EXCLUDED.label, position = EXCLUDED.position;

-- Reference data, readable by any signed-in user. The RPCs below are SECURITY
-- INVOKER and join this table, so without a read policy they would silently
-- return kerneopgave rows with no label -- the same shape of failure that left
-- the templates table unreadable.
ALTER TABLE public.kerneopgave_section_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read kerneopgave labels" ON public.kerneopgave_section_labels;
CREATE POLICY "Authenticated users can read kerneopgave labels"
  ON public.kerneopgave_section_labels FOR SELECT TO authenticated USING (true);

-- 2. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS kerneopgave_sections_published_fts_idx
  ON public.kerneopgave_sections
  USING gin (to_tsvector('danish', public.tiptap_to_text(published_content)));

CREATE INDEX IF NOT EXISTS kerneopgaver_title_fts_idx
  ON public.kerneopgaver
  USING gin (to_tsvector('danish', title));

-- 3. The three RPCs -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_documents_containing(search_term text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH hits AS (
    SELECT s.document_id
      FROM public.document_sections s
     WHERE to_tsvector('danish', public.tiptap_to_text(s.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
     WHERE to_tsvector('danish', public.tiptap_to_text(ks.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
     WHERE to_tsvector('danish', k.title) @@ plainto_tsquery('danish', search_term)
  )
  SELECT count(DISTINCT hits.document_id) FROM hits;
$$;

CREATE OR REPLACE FUNCTION public.search_documents(search_term text)
RETURNS TABLE (document_id uuid, title text, matches bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH hits AS (
    SELECT s.document_id
      FROM public.document_sections s
     WHERE to_tsvector('danish', public.tiptap_to_text(s.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
     WHERE to_tsvector('danish', public.tiptap_to_text(ks.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
     WHERE to_tsvector('danish', k.title) @@ plainto_tsquery('danish', search_term)
  )
  SELECT d.id, d.title, count(*) AS matches
    FROM public.documents d
    JOIN hits ON hits.document_id = d.id
   GROUP BY d.id, d.title
   ORDER BY matches DESC;
$$;

-- Kerneopgave rows are labelled "<section name> > <kerneopgave> > <subsection>"
-- so the model can tell which item a passage belongs to, and are ordered after
-- the section they belong to rather than appended at the end. The section name
-- comes from the document's own template, which numbers kerneopgaver 2.2 or 2.3
-- depending on which template it uses.
CREATE OR REPLACE FUNCTION public.get_document_text(doc_id uuid)
RETURNS TABLE (title text, section_title text, body text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH doc AS (
    SELECT d.id, d.title, d.template_id FROM public.documents d WHERE d.id = doc_id
  ),
  kerne AS (
    SELECT ts.name, ts.position
      FROM public.template_sections ts
      JOIN doc ON ts.template_id = doc.template_id
     WHERE ts.section_key = 'kerneopgaver'
     LIMIT 1
  )
  SELECT x.title, x.section_title, x.body FROM (
    SELECT doc.title,
           coalesce(ts.name, 'Untitled section') AS section_title,
           public.tiptap_to_text(s.published_content) AS body,
           coalesce(ts.position, 2147483647) AS p1, 0 AS p2, 0 AS p3
      FROM doc
      JOIN public.document_sections s ON s.document_id = doc.id
      LEFT JOIN public.template_sections ts ON ts.id = s.template_section_id
    UNION ALL
    SELECT doc.title,
           coalesce((SELECT kerne.name FROM kerne), 'Kerneopgaver')
             || ' > ' || k.title
             || ' > ' || coalesce(l.label, ks.section_type) AS section_title,
           public.tiptap_to_text(ks.published_content) AS body,
           coalesce((SELECT kerne.position FROM kerne), 2147483646) AS p1,
           k.position AS p2,
           coalesce(l.position, 0) AS p3
      FROM doc
      JOIN public.kerneopgaver k ON k.document_id = doc.id
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
      LEFT JOIN public.kerneopgave_section_labels l ON l.section_type = ks.section_type
     WHERE ks.published_content IS NOT NULL
  ) x
  ORDER BY x.p1, x.p2, x.p3;
$$;

GRANT EXECUTE ON FUNCTION public.count_documents_containing(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_documents(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_text(uuid)         TO authenticated;
