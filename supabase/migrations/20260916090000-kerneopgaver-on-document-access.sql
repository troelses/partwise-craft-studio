-- Put kerneopgaver on the same permission model as everything else.
--
-- The kerneopgave policies grant read through user_permissions.can_view and
-- write through user_permissions.can_edit, while document_sections and every
-- other table moved to document_access. Verified on PostgreSQL 16 with the real
-- policies: a user holding document_access 'approve' and no legacy row sees
-- ZERO kerneopgaver, while a user with a legacy can_view row sees them. So
-- section 2.2 is invisible today to anyone granted access the modern way.
--
-- The reverse case is already incoherent rather than useful: document_sections
-- is gated entirely on document_access, so a user holding only legacy rows can
-- see none of the document's ordinary sections. They see kerneopgaver and
-- nothing else. This migration ends that split rather than taking away coherent
-- access.
--
-- It also adds the WITH CHECK that the legacy write policy lacked. A FOR ALL
-- policy with only USING does not constrain INSERT, so the old rules let an
-- editor insert kerneopgaver into a document they had no rights to.
--
-- Admin and team-lead policies are deliberately left alone: team_lead_id is not
-- a document_access grant, and a team lead must keep working.
--
-- Idempotent; safe to re-run.

-- Report who this affects before changing anything. Shown as a NOTICE in the
-- SQL editor output.
DO $$
DECLARE
  v_legacy_only integer;
BEGIN
  SELECT count(*) INTO v_legacy_only
    FROM (
      SELECT DISTINCT up.user_id, up.document_id
        FROM public.user_permissions up
       WHERE (up.can_view OR up.can_edit)
         AND NOT EXISTS (
           SELECT 1 FROM public.document_access da
            WHERE da.user_id = up.user_id
              AND da.document_id::text = up.document_id
         )
    ) AS legacy_only;

  RAISE NOTICE '% user/document pair(s) hold a legacy permission but no document_access grant. They lose kerneopgave visibility here, and already could not see the document''s other sections.', v_legacy_only;
END $$;

-- kerneopgaver -----------------------------------------------------------------
DROP POLICY IF EXISTS "Editors can manage kerneopgaver" ON public.kerneopgaver;
DROP POLICY IF EXISTS "Viewers can read kerneopgaver"   ON public.kerneopgaver;

DROP POLICY IF EXISTS "Read kerneopgaver by access" ON public.kerneopgaver;
CREATE POLICY "Read kerneopgaver by access"
  ON public.kerneopgaver FOR SELECT
  USING (public.has_document_access(document_id, auth.uid()));

DROP POLICY IF EXISTS "Write kerneopgaver (write+)" ON public.kerneopgaver;
CREATE POLICY "Write kerneopgaver (write+)"
  ON public.kerneopgaver FOR ALL
  USING (public.can_write_document(document_id, auth.uid()))
  WITH CHECK (public.can_write_document(document_id, auth.uid()));

-- kerneopgave_sections ---------------------------------------------------------
DROP POLICY IF EXISTS "Editors can manage kerneopgave_sections" ON public.kerneopgave_sections;
DROP POLICY IF EXISTS "Viewers can read kerneopgave_sections"   ON public.kerneopgave_sections;

DROP POLICY IF EXISTS "Read kerneopgave_sections by access" ON public.kerneopgave_sections;
CREATE POLICY "Read kerneopgave_sections by access"
  ON public.kerneopgave_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
       WHERE k.id = kerneopgave_sections.kerneopgave_id
         AND public.has_document_access(k.document_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Write kerneopgave_sections (write+)" ON public.kerneopgave_sections;
CREATE POLICY "Write kerneopgave_sections (write+)"
  ON public.kerneopgave_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
       WHERE k.id = kerneopgave_sections.kerneopgave_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
       WHERE k.id = kerneopgave_sections.kerneopgave_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  );
