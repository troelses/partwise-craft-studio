-- Let authenticated users list the templates.
--
-- public.templates has row-level security enabled but no SELECT policy, so the
-- table returns zero rows to every logged-in user. Reproduced on PostgreSQL 16:
-- with RLS on and no policy, `templates` yields 0 rows while `template_sections`
-- still yields its rows -- which is exactly the observed behaviour, documents
-- rendering normally while both template pickers sit empty.
--
-- The table has a single reader in the whole application,
-- templateService.getTemplates(), so nothing else ever exercised the gap. It has
-- been there since the Versions tab shipped: that dialog preselects the current
-- template, so an empty list looks populated until it is opened.
--
-- This grants strictly less than the app already exposes. template_sections --
-- the actual contents of every template, section names and all -- is readable by
-- any authenticated user today; this adds only the parent row's name and
-- description. Writes stay closed: templates are created by migration, and with
-- RLS enabled and no INSERT/UPDATE/DELETE policy, no client can change them.
--
-- Idempotent; safe to re-run.

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.templates;
CREATE POLICY "Authenticated users can read templates"
  ON public.templates
  FOR SELECT
  TO authenticated
  USING (true);
