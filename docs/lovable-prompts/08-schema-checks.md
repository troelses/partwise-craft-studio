# Prompt 8 — Add the schema verification scripts

Two dashboard-pasteable scripts. Neither is imported by application code.

- `schema-status.sql` — reports, in 14 rows, whether each migration has actually
  landed. It inspects the catalog rather than the CLI's migration ledger, so it
  tells the truth whether SQL was applied via `db push` or by hand. It also
  detects a stale-but-present function, which a generated `types.ts` cannot.
- `sync-migration-ledger.sql` — records hand-applied migrations in
  `supabase_migrations.schema_migrations`, the table the Supabase CLI uses to
  decide what still needs applying.

> **Do not execute any of this SQL.** Every statement below has *already* been
> applied to the Supabase project by hand, and verified with
> `schema-status.sql` (all rows `ok`). This prompt only adds the files to the
> repository so the schema history is recorded in version control.
>
> Specifically: do **not** run these against the database, do **not** apply them
> through the Supabase integration, do **not** generate new or "corrected"
> migrations, and do **not** alter the database in any way. Create the files
> with exactly the contents given, byte for byte, and change nothing else.


---

## 1. Create `supabase/checks/schema-status.sql`

```sql
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

  -- 20260902090000 : versioning bound to document_access ----------------------
  -- These cannot be inferred from types.ts. A generated types file can name an
  -- RPC that does not exist in the database, so check the catalog directly.
  UNION ALL
  SELECT 12, 'can_publish_document_version exists',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'can_publish_document_version'
         ) THEN 'ok' ELSE 'MISSING -> apply 20260902090000' END

  UNION ALL
  SELECT 13, 'version permissions read document_access',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'can_manage_document_versions'
              AND p.prosrc LIKE '%document_access%'
         ) THEN 'ok'
         ELSE 'STALE -> still keyed to team_lead_id; apply 20260902090000' END

  UNION ALL
  SELECT 14, 'new versions inherit grants',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'create_document_version'
              AND p.prosrc LIKE '%document_access%'
         ) THEN 'ok'
         ELSE 'STALE -> versions will be invisible to everyone but their creator; apply 20260902090000' END
)
SELECT item, status FROM checks ORDER BY sort_order;
```

## 2. Create `supabase/checks/sync-migration-ledger.sql`

```sql
-- Record migrations that were applied by hand in the Supabase dashboard.
--
-- The Supabase CLI tracks what it has applied in
-- supabase_migrations.schema_migrations. SQL run in the dashboard never writes
-- there, so the ledger drifts out of step with the real schema. That matters
-- the first time anyone runs `supabase db push`: with an empty or incomplete
-- ledger the CLI replays migrations that are already applied, and the older
-- ones in this repo are NOT idempotent (they ADD COLUMN and CREATE POLICY
-- unconditionally), so the push fails partway.
--
-- Run this in the SQL editor after applying a migration by hand.
--
-- IMPORTANT: only list migrations you know are actually applied. Run
-- schema-status.sql first to confirm. Marking a migration applied when it is
-- not means `supabase db push` will silently skip it forever.

-- 1. Create the ledger if this project has never been touched by the CLI.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version    text NOT NULL PRIMARY KEY,
  statements text[],
  name       text
);

-- 2. Mark the applied migrations.
--    Only `version` is written, so this works against both the current table
--    shape and the older version-only shape used by earlier CLI releases.
--    Add a row here whenever you apply another migration by hand.
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES
  ('20250629193017'),   -- initial schema, profiles, permissions
  ('20250629200131'),   -- policy adjustments
  ('20250630112600'),   -- fix RLS recursion
  ('20250630113000'),   -- fix RLS final, check_user_role
  ('20250701113958'),   -- team leads, check_team_lead
  ('20260831120000'),   -- specialebeskrivelse_310826 template + kerneopgaver
  ('20260901090000'),   -- document versioning
  ('20260902090000')    -- versioning bound to document_access
ON CONFLICT DO NOTHING;

-- 3. Show the resulting ledger.
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

---

## Why `sync-migration-ledger.sql` matters

The ledger is currently empty, because everything was applied through the
dashboard. The first time anyone runs `supabase db push`, the CLI will therefore
try to replay **every** migration in the repo. The three recent ones are
idempotent and would shrug that off, but the 2025 migrations are not — they
`ADD COLUMN` and `CREATE POLICY` unconditionally, so the push would fail partway
with the schema half-touched.

Running `sync-migration-ledger.sql` once, in the SQL editor, removes that trap.
It is a database action rather than a code change, so it is not part of this
prompt — run it yourself after the files are committed.
