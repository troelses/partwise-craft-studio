-- Update template sections to match the new specialebeskrivelse structure,
-- and add tables for the dynamic kerneopgaver feature.

-- 1. Replace template sections for the default template -----------------------
DELETE FROM public.template_sections
WHERE template_id = '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03';

-- Add section_key column if it doesn't exist (used by the frontend to identify
-- sections that need special rendering, e.g. the kerneopgaver section).
ALTER TABLE public.template_sections
  ADD COLUMN IF NOT EXISTS section_key TEXT;

INSERT INTO public.template_sections (template_id, name, position, level, description, section_key)
VALUES
  ('439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
   '1. Kort overordnet beskrivelse af specialet', 10, 1,
   'Beskriv specialets generelle karakter, patientgruppe og organisering.', NULL),
  ('439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
   '2.1 Generelle opgaver', 20, 2,
   'Generelle opgaver der kan varetages på tværs af specialer.', NULL),
  ('439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
   '2.2 Kerneopgaver', 30, 2,
   'Introduktionstekst til kerneopgaverne samt liste over specialets kerneopgaver.',
   'kerneopgaver'),
  ('439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
   '3. Øvrige samarbejdende faggrupper', 40, 1,
   'Det tværfaglige og tværsektorielle samarbejde.', NULL),
  ('439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
   '4. Forventet udvikling af teknologi og behandlingsmetoder', 50, 1,
   'Teknologisk og metodisk udvikling inden for specialet i et 10-15-årigt perspektiv.', NULL),
  ('439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
   '5. Arbejdsgruppens medlemmer', 60, 1,
   'Medlemmer af den arbejdsgruppe der har udarbejdet specialebeskrivelsen.', NULL),
  ('439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
   '6. Anvendt materiale', 70, 1,
   'Referenceliste over det materiale arbejdsgruppen har anvendt.', NULL);

-- 2. kerneopgaver table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kerneopgaver (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. kerneopgave_sections table -----------------------------------------------
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

-- 4. RLS ----------------------------------------------------------------------
ALTER TABLE public.kerneopgaver       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kerneopgave_sections ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (public.check_user_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage kerneopgave_sections"
  ON public.kerneopgave_sections FOR ALL
  USING (public.check_user_role(auth.uid(), 'admin'));

-- Team leads: full access on their documents
CREATE POLICY "Team leads can manage kerneopgaver"
  ON public.kerneopgaver FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = kerneopgaver.document_id
        AND d.team_lead_id = auth.uid()
    )
  );

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

-- 5. Indexes ------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_kerneopgaver_document_id
  ON public.kerneopgaver(document_id);
CREATE INDEX IF NOT EXISTS idx_kerneopgaver_position
  ON public.kerneopgaver(document_id, position);
CREATE INDEX IF NOT EXISTS idx_kerneopgave_sections_kerneopgave_id
  ON public.kerneopgave_sections(kerneopgave_id);
