-- Schema status check.
--
-- Paste into the Supabase SQL editor and run. Every row should read 'ok'.
-- Anything else tells you which migration has not landed yet.
--
-- This inspects the schema itself rather than the CLI's migration ledger, so it
-- reports the truth whether a migration was applied with `supabase db push` or
-- by hand in the dashboard.

-- The two data checks at the end read columns that only exist once the
-- versioning migration has run. A CASE guard is not enough — Postgres parses
-- the whole statement before evaluating any branch — so they go through
-- dynamic SQL in a temporary function (dropped when the session ends).
CREATE OR REPLACE FUNCTION pg_temp.versioning_data_status(which text)
RETURNS text
LANGUAGE plpgsql
AS $fn$
DECLARE
  n bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'documents'
       AND column_name  = 'version_group_id'
  ) THEN
    RETURN 'n/a (versioning not applied)';
  END IF;

  IF which = 'orphans' THEN
    EXECUTE 'SELECT count(*) FROM public.documents WHERE version_group_id IS NULL'
       INTO n;
    RETURN CASE WHEN n = 0 THEN 'ok'
                ELSE n::text || ' document(s) have no version_group_id' END;
  ELSE
    EXECUTE $q$
      SELECT count(*) FROM (
        SELECT version_group_id FROM public.documents
         GROUP BY version_group_id
        HAVING count(*) FILTER (WHERE is_current) <> 1
      ) bad
    $q$ INTO n;
    RETURN CASE WHEN n = 0 THEN 'ok'
                ELSE n::text || ' group(s) have zero or several current versions' END;
  END IF;
END
$fn$;

WITH checks(sort_order, item, status) AS (

  -- 20260831120000 : new template + kerneopgaver ------------------------------
  SELECT 1, 'template_sections.section_key column',
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'template_sections'
              AND column_name  = 'section_key'
         ) THEN 'ok' ELSE 'MISSING -> apply 20260831120000' END

  UNION ALL
  SELECT 2, 'template specialebeskrivelse_310826 exists',
         CASE WHEN EXISTS (
           SELECT 1 FROM public.templates
            WHERE id = 'b9a66e83-b40f-417d-abe8-14050e00c5c3'
         ) THEN 'ok' ELSE 'MISSING -> apply 20260831120000' END

  UNION ALL
  SELECT 3, 'new template section count (expect 7)',
         CASE WHEN (
           SELECT count(*) FROM public.template_sections
            WHERE template_id = 'b9a66e83-b40f-417d-abe8-14050e00c5c3'
         ) = 7 THEN 'ok' ELSE 'got ' || (
           SELECT count(*)::text FROM public.template_sections
            WHERE template_id = 'b9a66e83-b40f-417d-abe8-14050e00c5c3'
         ) END

  UNION ALL
  -- If this is 0, the ORIGINAL destructive version of 20260831120000 was applied
  -- at some point and the legacy template's sections were deleted.
  SELECT 4, 'legacy template still has its sections',
         CASE WHEN (
           SELECT count(*) FROM public.template_sections
            WHERE template_id = '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03'
         ) > 0 THEN 'ok'
         ELSE 'ZERO -> legacy sections were deleted by the old destructive migration' END

  UNION ALL
  SELECT 5, 'kerneopgaver table',
         CASE WHEN to_regclass('public.kerneopgaver') IS NOT NULL
              THEN 'ok' ELSE 'MISSING -> apply 20260831120000' END

  UNION ALL
  SELECT 6, 'kerneopgave_sections table',
         CASE WHEN to_regclass('public.kerneopgave_sections') IS NOT NULL
              THEN 'ok' ELSE 'MISSING -> apply 20260831120000' END

  -- 20260901090000 : document versioning --------------------------------------
  UNION ALL
  SELECT 7, 'documents versioning columns',
         CASE WHEN (
           SELECT count(*) FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'documents'
              AND column_name IN ('version_group_id', 'version_number', 'is_current')
         ) = 3 THEN 'ok' ELSE 'MISSING -> apply 20260901090000' END

  UNION ALL
  SELECT 8, 'single-current-version unique index',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname  = 'uq_documents_current_version'
         ) THEN 'ok' ELSE 'MISSING -> apply 20260901090000' END

  UNION ALL
  SELECT 9, 'version functions',
         CASE WHEN (
           SELECT count(DISTINCT p.proname)
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname IN ('can_manage_document_versions',
                                'create_document_version',
                                'set_current_document_version')
         ) = 3 THEN 'ok' ELSE 'MISSING -> apply 20260901090000' END

  UNION ALL
  SELECT 10, 'every document has a version group',
         pg_temp.versioning_data_status('orphans')

  UNION ALL
  SELECT 11, 'exactly one current version per document group',
         pg_temp.versioning_data_status('current')
)
SELECT item, status FROM checks ORDER BY sort_order;
