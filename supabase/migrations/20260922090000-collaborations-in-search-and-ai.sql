-- Collaborating specialties reach search and Ask AI.
--
-- Stage H of the structured-Fællesopgaver work. Requires 20260921090000.
--
-- The whole point of storing these as rows was to be able to ask which
-- specialties collaborate with which. That only works if the RPCs read them:
-- until now they read document_sections, kerneopgave_sections and kerneopgave
-- titles, and a collaboration lived in none of those.
--
-- Both the specialty NAME and the description are searchable. The name is the
-- more useful of the two — "which documents name radiologi" is the question this
-- feature exists to answer — and unlike the description it is not draft or
-- published, so it is matched regardless of approval. That matches how
-- kerneopgave titles already behave.
--
-- Descriptions follow the approval rule: only published_description is read.
--
-- Both indexes are new, so there is no stale-index hazard and no REINDEX.

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_published_fts_idx
  ON public.kerneopgave_collaborations
  USING gin (to_tsvector('danish', public.tiptap_to_text(published_description)));

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_name_fts_idx
  ON public.kerneopgave_collaborations
  USING gin (to_tsvector('danish', specialty_name));

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
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgave_collaborations kc
      JOIN public.kerneopgave_sections ks ON ks.id = kc.kerneopgave_section_id
      JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
     WHERE to_tsvector('danish', kc.specialty_name) @@ plainto_tsquery('danish', search_term)
        OR to_tsvector('danish', public.tiptap_to_text(kc.published_description))
           @@ plainto_tsquery('danish', search_term)
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
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgave_collaborations kc
      JOIN public.kerneopgave_sections ks ON ks.id = kc.kerneopgave_section_id
      JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
     WHERE to_tsvector('danish', kc.specialty_name) @@ plainto_tsquery('danish', search_term)
        OR to_tsvector('danish', public.tiptap_to_text(kc.published_description))
           @@ plainto_tsquery('danish', search_term)
  )
  SELECT d.id, d.title, count(*) AS matches
    FROM public.documents d
    JOIN hits ON hits.document_id = d.id
   GROUP BY d.id, d.title
   ORDER BY matches DESC;
$$;

-- Collaborations are emitted as one row per kerneopgave, joined into a single
-- readable line, rather than one row per specialty. The model reads this as
-- prose, and fifteen separate two-word rows would be noise where one line saying
-- "collaborates with Radiologi: ..., Anæstesiologi: ..." is not.
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
    UNION ALL
    SELECT doc.title,
           coalesce((SELECT kerne.name FROM kerne), 'Kerneopgaver')
             || ' > ' || k.title
             || ' > Samarbejdende specialer' AS section_title,
           string_agg(
             kc.specialty_name
               || CASE
                    WHEN coalesce(public.tiptap_to_text(kc.published_description), '') = '' THEN ''
                    ELSE ': ' || public.tiptap_to_text(kc.published_description)
                  END,
             ' | ' ORDER BY kc.position, kc.specialty_name) AS body,
           coalesce((SELECT kerne.position FROM kerne), 2147483646) AS p1,
           k.position AS p2,
           -- Immediately after the faellesopgaver subsection it belongs to.
           coalesce((SELECT l2.position FROM public.kerneopgave_section_labels l2
                      WHERE l2.section_type = 'faellesopgaver'), 50) + 1 AS p3
      FROM doc
      JOIN public.kerneopgaver k ON k.document_id = doc.id
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
      JOIN public.kerneopgave_collaborations kc ON kc.kerneopgave_section_id = ks.id
     GROUP BY doc.title, k.title, k.position
  ) x
  ORDER BY x.p1, x.p2, x.p3;
$$;

GRANT EXECUTE ON FUNCTION public.count_documents_containing(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_documents(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_text(uuid)         TO authenticated;
