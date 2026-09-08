-- A second specialebeskrivelse template, for the Intern medicin specialties.
--
-- Derived from the 13 draft documents, which fall into exactly two structural
-- families. Nine of them -- endokrinologi, gastroenterologi, geriatri,
-- hæmatologi, infektionsmedicin, kardiologi, lungesygdomme, nefrologi and
-- reumatologi -- carry a level-2 section "Intern medicin" between "Generelle
-- opgaver" and "Specialespecifikke kerneopgaver", which has no home in the
-- existing 7-section template. The other four (Børne- og ungdomspsykiatri,
-- Neurologi, Pædiatri, Psykiatri) match the existing template exactly.
--
-- Rather than bend either the template or the documents, the Intern medicin
-- family gets its own template and the importer lets the user pick which one a
-- document is being imported against.
--
-- Purely additive: the existing template and all of its sections are untouched,
-- so documents already built on it are unaffected. Idempotent; safe to re-run.

INSERT INTO public.templates (id, name, description)
VALUES (
  '97f81a05-42c7-4865-a90e-74ea94b760bf',
  'specialebeskrivelse_intern_medicin',
  'Specialebeskrivelse-skabelon for Intern medicin-specialerne. Som standardskabelonen, men med et ekstra afsnit "2.2 Intern medicin"; kerneopgaverne er derfor nummereret 2.3.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.template_sections (template_id, name, position, level, description, section_key)
SELECT * FROM (VALUES
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '1. Kort overordnet beskrivelse af specialet', 10, 1,
   'Beskriv specialets generelle karakter, patientgruppe og organisering.', NULL::text),
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '2.1 Generelle opgaver', 20, 2,
   'Generelle opgaver der kan varetages på tværs af specialer.', NULL::text),
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '2.2 Intern medicin', 30, 2,
   'Opgaver der varetages i kraft af den fælles intern medicinske kompetence.', NULL::text),
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '2.3 Kerneopgaver', 40, 2,
   'Introduktionstekst til kerneopgaverne samt liste over specialets kerneopgaver.',
   'kerneopgaver'::text),
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '3. Øvrige samarbejdende faggrupper', 50, 1,
   'Det tværfaglige og tværsektorielle samarbejde.', NULL::text),
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '4. Forventet udvikling af teknologi og behandlingsmetoder', 60, 1,
   'Teknologisk og metodisk udvikling inden for specialet i et 10-15-årigt perspektiv.', NULL::text),
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '5. Arbejdsgruppens medlemmer', 70, 1,
   'Medlemmer af den arbejdsgruppe der har udarbejdet specialebeskrivelsen.', NULL::text),
  ('97f81a05-42c7-4865-a90e-74ea94b760bf'::uuid,
   '6. Anvendt materiale', 80, 1,
   'Referenceliste over det materiale arbejdsgruppen har anvendt.', NULL::text)
) AS v(template_id, name, position, level, description, section_key)
WHERE NOT EXISTS (
  SELECT 1 FROM public.template_sections ts
  WHERE ts.template_id = '97f81a05-42c7-4865-a90e-74ea94b760bf'
);
