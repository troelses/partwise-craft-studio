# Prompt 13 — A second template, for the Intern medicin specialties

Groundwork for .docx import (prompt 14). Useful on its own: it makes the
Intern medicin documents representable.

All 13 draft specialebeskrivelser were taken apart to derive this. They fall
into exactly two structural families, and no third structure appeared:

| Family | Level-2 sections under *Opgaver i …* | Count | Specialties |
|---|---|---|---|
| Standard | Generelle opgaver, Kerneopgaver | 4 | Børne- og ungdomspsykiatri, Neurologi, Pædiatri, Psykiatri |
| Intern medicin | Generelle opgaver, **Intern medicin**, Specialespecifikke kerneopgaver | 9 | endokrinologi, gastroenterologi, geriatri, hæmatologi, infektionsmedicin, kardiologi, lungesygdomme, nefrologi, reumatologi |

That extra `Intern medicin` section has no home in the existing 7-section
template, so the Intern medicin family gets its own 8-section template and the
importer will let the user pick which one a document is imported against.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- The migration is purely additive: the existing template must not be touched.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.

---

## 1. Create `supabase/migrations/20260903120000-intern-medicin-template.sql`

```sql
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
```

## 2. Create `src/constants/kerneopgaver.ts`

The five subsection types move here so that the importer can use them without
importing the Supabase client. That matters: the importer must run without any
database access, and importing the client would both undermine that and drag the
entire Supabase SDK into a module that has no business with it. Extracting these
took the parser bundle from 872 kB to 15 kB, with zero Supabase references.

```ts
/**
 * The five fixed subsections of a kerneopgave.
 *
 * These live here rather than in kerneopgaverService so that code which only
 * needs to reason about the shape — the .docx importer, in particular — does not
 * transitively import the Supabase client. The importer is deliberately free of
 * database access, and importing the client would both undermine that and make
 * it impossible to run outside a browser session.
 *
 * kerneopgaverService re-exports these, so existing imports keep working.
 */

export type KerneopgaveSectionType =
  | 'almenmedicinske_tilbud'
  | 'speciallaegepraksis'
  | 'sygehus'
  | 'faellesopgaver'
  | 'fremtidig_varetagelse';

export const KERNEOPGAVE_SECTION_LABELS: Record<KerneopgaveSectionType, string> = {
  almenmedicinske_tilbud: 'Almenmedicinske tilbud',
  speciallaegepraksis:    'Speciallægepraksis',
  sygehus:                'Sygehus',
  faellesopgaver:         'Fællesopgaver med andre specialer',
  fremtidig_varetagelse:  'Fremtidig varetagelse',
};

export const KERNEOPGAVE_SECTION_TYPES: KerneopgaveSectionType[] = [
  'almenmedicinske_tilbud',
  'speciallaegepraksis',
  'sygehus',
  'faellesopgaver',
  'fremtidig_varetagelse',
];
```

## 3. `src/services/kerneopgaverService.ts` — re-export instead of define

Find:

```ts
import { supabase } from '@/integrations/supabase/client';

export type KerneopgaveSectionType =
  | 'almenmedicinske_tilbud'
  | 'speciallaegepraksis'
  | 'sygehus'
  | 'faellesopgaver'
  | 'fremtidig_varetagelse';

export const KERNEOPGAVE_SECTION_LABELS: Record<KerneopgaveSectionType, string> = {
  almenmedicinske_tilbud: 'Almenmedicinske tilbud',
  speciallaegepraksis:    'Speciallægepraksis',
  sygehus:                'Sygehus',
  faellesopgaver:         'Fællesopgaver med andre specialer',
  fremtidig_varetagelse:  'Fremtidig varetagelse',
};

export const KERNEOPGAVE_SECTION_TYPES: KerneopgaveSectionType[] = [
  'almenmedicinske_tilbud',
  'speciallaegepraksis',
  'sygehus',
  'faellesopgaver',
  'fremtidig_varetagelse',
];
```

Replace with:

```ts
import { supabase } from '@/integrations/supabase/client';
import {
  KerneopgaveSectionType,
  KERNEOPGAVE_SECTION_TYPES,
} from '@/constants/kerneopgaver';

// The five subsection types live in constants so that the .docx importer can
// use them without importing the Supabase client. Re-exported here so existing
// imports of this module are unaffected.
export type { KerneopgaveSectionType } from '@/constants/kerneopgaver';
export {
  KERNEOPGAVE_SECTION_LABELS,
  KERNEOPGAVE_SECTION_TYPES,
} from '@/constants/kerneopgaver';
```

Everything downstream keeps importing from `kerneopgaverService` exactly as
before — the re-export means no other file changes.

---

## After applying

- Run `supabase/checks/schema-status.sql`; all rows should still read `ok`.
- Confirm two templates now exist and the original is unchanged:

```sql
select t.name, count(ts.id) as sections
from public.templates t
left join public.template_sections ts on ts.template_id = t.id
group by t.name order by t.name;
```

  `specialebeskrivelse_310826` must still have **7** sections and
  `specialebeskrivelse_intern_medicin` must have **8**, with `section_key =
  'kerneopgaver'` on `2.3 Kerneopgaver`.
