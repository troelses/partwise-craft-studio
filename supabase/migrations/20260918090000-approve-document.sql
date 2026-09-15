-- Approve a whole document in one transaction.
--
-- Stage C of docs/kerneopgaver-approval-scope.md. Requires the publish columns
-- from 20260917090000.
--
-- This replaces a client-side loop over approve_section. The loop could not be
-- atomic: it approved sections one at a time, so a failure part-way left some
-- published and the rest not, and the user had to read a "3 of 8 approved"
-- message to find out. A single function is one transaction — it commits
-- entirely or not at all.
--
-- It also covers kerneopgave subsections, which approve_section cannot reach:
-- that function resolves its argument in document_sections, and kerneopgaver
-- live in their own tables.
--
-- Pending means exactly what the dashboard shows as pending: draft content
-- present, not currently approved. A row with no draft is left alone, and so is
-- one already approved.
--
-- The publish guards on both tables still fire on these updates. They are not
-- bypassed by SECURITY DEFINER, because auth.uid() reports the caller either
-- way — the permission check below is what makes them pass.
--
-- approve_section is untouched; the per-section button keeps using it.

CREATE OR REPLACE FUNCTION public.approve_document(doc_id uuid)
RETURNS TABLE (sections_approved integer, kerneopgave_sections_approved integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sections integer := 0;
  v_subsections integer := 0;
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
   WHERE k.id               = ks.kerneopgave_id
     AND k.document_id      = doc_id
     AND ks.draft_content   IS NOT NULL
     AND ks.is_approved     IS DISTINCT FROM true;
  GET DIAGNOSTICS v_subsections = ROW_COUNT;

  RETURN QUERY SELECT v_sections, v_subsections;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_document(uuid) TO authenticated;
