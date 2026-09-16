-- Make kerneopgaver reachable by search and by Ask AI.

CREATE TABLE IF NOT EXISTS public.kerneopgave_section_labels (
  section_type TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  position     INTEGER NOT NULL
);

GRANT SELECT ON public.kerneopgave_section_labels TO authenticated;
GRANT ALL ON public.kerneopgave_section_labels TO service_role;

INSERT INTO public.kerneopgave_section_labels (section_type, label, position) VALUES
  ('almenmedicinske_tilbud', 'Almenmedicinske tilbud',             10),
  ('speciallaegepraksis',    'Speciallægepraksis',                 20),
  ('sygehus',                'Sygehus',                            30),
  ('ambulant',               'Ambulant',                           40),
  ('faellesopgaver',         'Fællesopgaver med andre specialer',  50),
  ('fremtidig_varetagelse',  'Fremtidig varetagelse',              60)
ON CONFLICT (section_type) DO UPDATE
  SET label = EXCLUDED.label, position = EXCLUDED.position;

ALTER TABLE public.kerneopgave_section_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read kerneopgave labels" ON public.kerneopgave_section_labels;
CREATE POLICY "Authenticated users can read kerneopgave labels"
  ON public.kerneopgave_section_labels FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS kerneopgave_sections_published_fts_idx
  ON public.kerneopgave_sections
  USING gin (to_tsvector('danish', public.tiptap_to_text(published_content)));

CREATE INDEX IF NOT EXISTS kerneopgaver_title_fts_idx
  ON public.kerneopgaver
  USING gin (to_tsvector('danish', title));

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