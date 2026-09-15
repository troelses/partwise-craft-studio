ALTER TABLE public.kerneopgaver
  ADD COLUMN IF NOT EXISTS lead_in jsonb;

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