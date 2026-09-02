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
