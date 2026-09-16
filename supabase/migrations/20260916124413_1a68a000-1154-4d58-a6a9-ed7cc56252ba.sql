-- Close the INSERT hole in the document_sections publish guard.
--
-- guard_section_publish_trg has been BEFORE UPDATE only since 20260701110410,
-- so the guard catches a writer who edits published_content but not one who
-- creates the row with published_content already set. The row policy for INSERT
-- is can_write_document, so any write-level user could publish arbitrary text by
-- inserting rather than updating, bypassing approve_section entirely.
--
-- kerneopgave_sections got this right in 20260917090000; this brings
-- document_sections into line.
--
-- The function has to become TG_OP-aware first. Referencing OLD in an INSERT
-- trigger raises "record old is not assigned yet", so widening the trigger
-- without rewriting the body would break every section insert.
--
-- Nothing legitimate sets published_content on INSERT, checked before writing
-- this: both client paths (documentService.updateSection and useSectionEditor)
-- insert draft_content only, and create_document_version has inserted only
-- draft_content since 20260902090000 — the new version starts unpublished on
-- purpose. The superseded 20260901090000 copy did carry published_content
-- across, so do not re-run that old migration; its function was replaced twice
-- over.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.guard_section_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Check permission only when something publish-related actually changed, so
  -- ordinary draft edits and inserts do not pay for the lookup.
  IF (NEW.is_approved IS TRUE
        AND (TG_OP = 'INSERT' OR OLD.is_approved IS DISTINCT FROM TRUE))
     OR (TG_OP = 'INSERT' AND NEW.published_content IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.published_content IS DISTINCT FROM OLD.published_content)
  THEN
    IF NOT public.can_approve_document(NEW.document_id, auth.uid()) THEN
      RAISE EXCEPTION 'Only approvers can publish a section';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_section_publish_trg ON public.document_sections;

CREATE TRIGGER guard_section_publish_trg
  BEFORE INSERT OR UPDATE ON public.document_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_section_publish();
