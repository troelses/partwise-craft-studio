-- Give kerneopgave subsections a published version, and guard it.
--
-- Stage B of docs/kerneopgaver-approval-scope.md. kerneopgave_sections has only
-- draft_content, so section 2.2 cannot be approved and never reaches search or
-- Ask AI — 58% of the text in the real documents. These columns are what an
-- approval writes into; the approve path itself is Stage C.
--
-- The trigger is the security-critical half, not a formality. The write policy
-- on kerneopgave_sections is FOR ALL, so without it any user with write-level
-- access could set published_content themselves and bypass approval entirely.
-- document_sections has had guard_section_publish_trg for exactly this reason
-- since 20260701110410, and this mirrors it.
--
-- One deliberate difference: this guards INSERT as well as UPDATE. The
-- document_sections guard is BEFORE UPDATE only, so a writer can create a row
-- with published_content already set. That same hole is therefore still open on
-- document_sections; closing it is a separate decision and is noted in the scope
-- rather than changed here.
--
-- Additive and idempotent. Existing rows get published_content NULL and
-- is_approved false, which is the correct starting state: nothing in section 2.2
-- has ever been approved.

ALTER TABLE public.kerneopgave_sections
  ADD COLUMN IF NOT EXISTS published_content jsonb,
  ADD COLUMN IF NOT EXISTS is_approved       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by       uuid,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz;

CREATE OR REPLACE FUNCTION public.guard_kerneopgave_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc uuid;
BEGIN
  -- Only look the document up when something publish-related actually changed,
  -- so ordinary draft edits do not pay for the join.
  IF (NEW.is_approved IS TRUE AND (TG_OP = 'INSERT' OR OLD.is_approved IS DISTINCT FROM TRUE))
     OR (TG_OP = 'INSERT' AND NEW.published_content IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.published_content IS DISTINCT FROM OLD.published_content)
  THEN
    SELECT k.document_id INTO v_doc
      FROM public.kerneopgaver k
     WHERE k.id = NEW.kerneopgave_id;

    IF v_doc IS NULL OR NOT public.can_approve_document(v_doc, auth.uid()) THEN
      RAISE EXCEPTION 'Only approvers can publish a kerneopgave section';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_kerneopgave_publish_trg ON public.kerneopgave_sections;

CREATE TRIGGER guard_kerneopgave_publish_trg
  BEFORE INSERT OR UPDATE ON public.kerneopgave_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_kerneopgave_publish();
