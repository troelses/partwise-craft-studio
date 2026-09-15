-- Two additions to the kerneopgave model, both driven by the real documents.
--
-- 1. A sixth subsection, "Ambulant", between Sygehus and Fællesopgaver.
--
-- 2. lead_in on kerneopgaver: the text that appears under a kerneopgave before
--    any named subsection heading. It had nowhere to live, so the importer
--    prepended it to whichever subsection happened to be detected first. In
--    geriatri that is "Fællesopgaver med andre specialer" for seven of eight
--    items, so 32 paragraphs of general description were filed under a heading
--    they have nothing to do with. It belongs to the kerneopgave as a whole.
--
-- Both are additive. No existing row changes: lead_in defaults to NULL, and
-- widening a CHECK constraint cannot invalidate rows that already satisfy it.
-- Idempotent; safe to re-run.

ALTER TABLE public.kerneopgaver
  ADD COLUMN IF NOT EXISTS lead_in jsonb;

-- The original constraint was declared inline, so it carries whatever name
-- Postgres generated. Find it by what it constrains rather than by guessing.
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
   WHERE nsp.nspname = 'public'
     AND rel.relname = 'kerneopgave_sections'
     AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) ILIKE '%section_type%'
   LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.kerneopgave_sections DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.kerneopgave_sections
  ADD CONSTRAINT kerneopgave_sections_section_type_check
  CHECK (section_type IN (
    'almenmedicinske_tilbud',
    'speciallaegepraksis',
    'sygehus',
    'ambulant',
    'faellesopgaver',
    'fremtidig_varetagelse'
  ));
