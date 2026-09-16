-- Structured "Fællesopgaver med andre specialer".
-- Stage F of the structured-Fællesopgaver plan. Requires the publish columns
-- (20260917090000) and approve_document (20260918090000).

CREATE TABLE IF NOT EXISTS public.kerneopgave_collaborations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kerneopgave_section_id uuid NOT NULL
                           REFERENCES public.kerneopgave_sections(id) ON DELETE CASCADE,
  position               integer NOT NULL DEFAULT 0,
  specialty_id           bigint,
  specialty_name         text NOT NULL,
  draft_description      jsonb,
  published_description  jsonb,
  is_approved            boolean NOT NULL DEFAULT false,
  approved_by            uuid,
  approved_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_section_idx
  ON public.kerneopgave_collaborations (kerneopgave_section_id, position);

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_specialty_idx
  ON public.kerneopgave_collaborations (specialty_id);

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_name_idx
  ON public.kerneopgave_collaborations (lower(specialty_name));

DO $$
DECLARE
  v_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'specialer'
     AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_type IS NULL THEN
    RAISE NOTICE 'public.specialer not found; specialty_id stays a plain column.';
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.kerneopgave_collaborations ALTER COLUMN specialty_id TYPE %s USING specialty_id::%s',
    v_type, v_type);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'kerneopgave_collaborations_specialty_id_fkey'
       AND conrelid = 'public.kerneopgave_collaborations'::regclass
  ) THEN
    ALTER TABLE public.kerneopgave_collaborations
      ADD CONSTRAINT kerneopgave_collaborations_specialty_id_fkey
      FOREIGN KEY (specialty_id) REFERENCES public.specialer(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not reference public.specialer (%); specialty_id stays a plain column.', SQLERRM;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kerneopgave_collaborations TO authenticated;

ALTER TABLE public.kerneopgave_collaborations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read collaborations by access" ON public.kerneopgave_collaborations;
CREATE POLICY "Read collaborations by access"
  ON public.kerneopgave_collaborations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.kerneopgave_sections ks
        JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
       WHERE ks.id = kerneopgave_collaborations.kerneopgave_section_id
         AND public.has_document_access(k.document_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Write collaborations (write+)" ON public.kerneopgave_collaborations;
CREATE POLICY "Write collaborations (write+)"
  ON public.kerneopgave_collaborations FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM public.kerneopgave_sections ks
        JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
       WHERE ks.id = kerneopgave_collaborations.kerneopgave_section_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.kerneopgave_sections ks
        JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
       WHERE ks.id = kerneopgave_collaborations.kerneopgave_section_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.guard_collaboration_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc uuid;
BEGIN
  IF (NEW.is_approved IS TRUE
        AND (TG_OP = 'INSERT' OR OLD.is_approved IS DISTINCT FROM TRUE))
     OR (TG_OP = 'INSERT' AND NEW.published_description IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.published_description IS DISTINCT FROM OLD.published_description)
  THEN
    SELECT k.document_id INTO v_doc
      FROM public.kerneopgave_sections ks
      JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
     WHERE ks.id = NEW.kerneopgave_section_id;

    IF v_doc IS NULL OR NOT public.can_approve_document(v_doc, auth.uid()) THEN
      RAISE EXCEPTION 'Only approvers can publish a collaboration';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_collaboration_publish_trg ON public.kerneopgave_collaborations;
CREATE TRIGGER guard_collaboration_publish_trg
  BEFORE INSERT OR UPDATE ON public.kerneopgave_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.guard_collaboration_publish();

DROP FUNCTION IF EXISTS public.approve_document(uuid);

CREATE FUNCTION public.approve_document(doc_id uuid)
RETURNS TABLE (
  sections_approved             integer,
  kerneopgave_sections_approved integer,
  collaborations_approved       integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sections       integer := 0;
  v_subsections    integer := 0;
  v_collaborations integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = doc_id) THEN
    RAISE EXCEPTION 'Document % not found', doc_id;
  END IF;

  IF NOT public.can_approve_document(doc_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to approve this document';
  END IF;

  UPDATE public.document_sections
     SET published_content = draft_content,
         is_approved       = true,
         approved_by       = auth.uid(),
         approved_at       = now(),
         updated_at        = now()
   WHERE document_id   = doc_id
     AND draft_content IS NOT NULL
     AND is_approved   IS DISTINCT FROM true;
  GET DIAGNOSTICS v_sections = ROW_COUNT;

  UPDATE public.kerneopgave_sections ks
     SET published_content = ks.draft_content,
         is_approved       = true,
         approved_by       = auth.uid(),
         approved_at       = now(),
         updated_at        = now()
    FROM public.kerneopgaver k
   WHERE k.id             = ks.kerneopgave_id
     AND k.document_id    = doc_id
     AND ks.draft_content IS NOT NULL
     AND ks.is_approved   IS DISTINCT FROM true;
  GET DIAGNOSTICS v_subsections = ROW_COUNT;

  UPDATE public.kerneopgave_collaborations kc
     SET published_description = kc.draft_description,
         is_approved           = true,
         approved_by           = auth.uid(),
         approved_at           = now(),
         updated_at            = now()
    FROM public.kerneopgave_sections ks
    JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
   WHERE ks.id                 = kc.kerneopgave_section_id
     AND k.document_id         = doc_id
     AND kc.is_approved        IS DISTINCT FROM true;
  GET DIAGNOSTICS v_collaborations = ROW_COUNT;

  RETURN QUERY SELECT v_sections, v_subsections, v_collaborations;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_document(uuid) TO authenticated;