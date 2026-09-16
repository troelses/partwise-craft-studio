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