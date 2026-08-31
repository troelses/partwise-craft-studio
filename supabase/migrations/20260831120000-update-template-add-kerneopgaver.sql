-- Create a new "specialebeskrivelse_310826" template matching the new
-- specialebeskrivelse structure, and add tables for the dynamic kerneopgaver
-- feature.
--
-- This migration is purely additive: the previous template
-- (439df5fa-9aa6-4c2f-bb71-f26fa4b29f03) and all of its sections are left
-- untouched, so existing documents keep rendering against the template they
-- were created with. New documents use the new template.
--
-- The whole script is idempotent and can safely be re-run.

-- 1. section_key column -------------------------------------------------------
-- Used by the frontend to identify sections that need special rendering
-- (currently only the kerneopgaver section).
ALTER TABLE public.template_sections
  ADD COLUMN IF NOT EXISTS section_key TEXT;

-- 2. New template -------------------------------------------------------------
INSERT INTO public.templates (id, name, description)
VALUES (
  'b9a66e83-b40f-417d-abe8-14050e00c5c3',
  'specialebeskrivelse_310826',
  'Specialebeskrivelse-skabelon (revideret 31-08-2026) med dynamiske kerneopgaver.'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Sections for the new template --------------------------------------------
INSERT INTO public.template_sections (template_id, name, position, level, description, section_key)
SELECT * FROM (VALUES
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '1. Kort overordnet beskrivelse af specialet', 10, 1,
   'Beskriv specialets generelle karakter, patientgruppe og organisering.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '2.1 Generelle opgaver', 20, 2,
   'Generelle opgaver der kan varetages på tværs af specialer.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '2.2 Kerneopgaver', 30, 2,
   'Introduktionstekst til kerneopgaverne samt liste over specialets kerneopgaver.',
   'kerneopgaver'::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '3. Øvrige samarbejdende faggrupper', 40, 1,
   'Det tværfaglige og tværsektorielle samarbejde.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '4. Forventet udvikling af teknologi og behandlingsmetoder', 50, 1,
   'Teknologisk og metodisk udvikling inden for specialet i et 10-15-årigt perspektiv.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '5. Arbejdsgruppens medlemmer', 60, 1,
   'Medlemmer af den arbejdsgruppe der har udarbejdet specialebeskrivelsen.', NULL::text),
  ('b9a66e83-b40f-417d-abe8-14050e00c5c3'::uuid,
   '6. Anvendt materiale', 70, 1,
   'Referenceliste over det materiale arbejdsgruppen har anvendt.', NULL::text)
) AS v(template_id, name, position, level, description, section_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.template_sections ts
  WHERE ts.template_id = 'b9a66e83-b40f-417d-abe8-14050e00c5c3'
);

-- 4. kerneopgaver table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kerneopgaver (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. kerneopgave_sections table -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.kerneopgave_sections (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kerneopgave_id  UUID NOT NULL REFERENCES public.kerneopgaver(id) ON DELETE CASCADE,
  section_type    TEXT NOT NULL CHECK (section_type IN (
                    'almenmedicinske_tilbud',
                    'speciallaegepraksis',
                    'sygehus',
                    'faellesopgaver',
                    'fremtidig_varetagelse'
                  )),
  draft_content   JSONB,
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(kerneopgave_id, section_type)
);

-- 6. RLS ----------------------------------------------------------------------
ALTER TABLE public.kerneopgaver         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kerneopgave_sections ENABLE ROW LEVEL SECURITY;

-- Admins: full access
DROP POLICY IF EXISTS "Admins can manage kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Admins can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (public.check_user_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Admins can manage kerneopgave_sections"
  ON public.kerneopgave_sections FOR ALL
  USING (public.check_user_role(auth.uid(), 'admin'));

-- Team leads: full access on their documents
DROP POLICY IF EXISTS "Team leads can manage kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Team leads can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = kerneopgaver.document_id
        AND d.team_lead_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team leads can manage kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Team leads can manage kerneopgave_sections"
  ON public.kerneopgave_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
      JOIN public.documents d ON d.id = k.document_id
      WHERE k.id = kerneopgave_sections.kerneopgave_id
        AND d.team_lead_id = auth.uid()
    )
  );

-- Editors (users with can_edit permission on the document): full access
DROP POLICY IF EXISTS "Editors can manage kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Editors can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id       = auth.uid()
        AND up.document_id   = kerneopgaver.document_id::text
        AND up.can_edit      = true
    )
  );

DROP POLICY IF EXISTS "Editors can manage kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Editors can manage kerneopgave_sections"
  ON public.kerneopgave_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
      JOIN public.user_permissions up
        ON up.document_id = k.document_id::text
      WHERE k.id           = kerneopgave_sections.kerneopgave_id
        AND up.user_id     = auth.uid()
        AND up.can_edit    = true
    )
  );

-- Viewers: read only
DROP POLICY IF EXISTS "Viewers can read kerneopgaver" ON public.kerneopgaver;
CREATE POLICY "Viewers can read kerneopgaver"
  ON public.kerneopgaver FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id     = auth.uid()
        AND up.document_id = kerneopgaver.document_id::text
        AND up.can_view    = true
    )
  );

DROP POLICY IF EXISTS "Viewers can read kerneopgave_sections" ON public.kerneopgave_sections;
CREATE POLICY "Viewers can read kerneopgave_sections"
  ON public.kerneopgave_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
      JOIN public.user_permissions up
        ON up.document_id = k.document_id::text
      WHERE k.id         = kerneopgave_sections.kerneopgave_id
        AND up.user_id   = auth.uid()
        AND up.can_view  = true
    )
  );

-- 7. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kerneopgaver_document_id
  ON public.kerneopgaver(document_id);
CREATE INDEX IF NOT EXISTS idx_kerneopgaver_position
  ON public.kerneopgaver(document_id, position);
CREATE INDEX IF NOT EXISTS idx_kerneopgave_sections_kerneopgave_id
  ON public.kerneopgave_sections(kerneopgave_id);
