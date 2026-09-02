# Prompt 1 — Template constants and the new section structure

**Guardrails — apply to every prompt in this folder:**

- Make only the changes described. Do not refactor, reformat or "improve" anything else.
- Do not change the security model. Do not regenerate or alter RLS policies.
- Do not switch any Supabase client to the `service_role` key. All queries stay caller-scoped so RLS applies.
- Do not modify the MCP integration, the `query-documents` edge function, or `document_access` logic.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


---

## 1. Create `src/constants/template.ts`

New file, exactly:

```ts
/**
 * Template used for newly created documents.
 *
 * Documents store their own `template_id`, and the editor resolves sections
 * against that column — this constant is only the default for new documents
 * and the fallback for legacy rows where `template_id` is null.
 */
export const DEFAULT_TEMPLATE_ID = 'b9a66e83-b40f-417d-abe8-14050e00c5c3';

/**
 * The original template, superseded by `specialebeskrivelse_310826`.
 * Kept so existing documents created against it continue to render.
 */
export const LEGACY_TEMPLATE_ID = '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03';

export const KERNEOPGAVER_SECTION_KEY = 'kerneopgaver';
```

## 2. Replace the contents of `src/services/templateService.ts`

The current file exports a 12-entry `SPECIALEBESKRIVELSER_TEMPLATE_SECTIONS`
array starting with `"Specialearbejdsgruppes medlemmer"`. Replace the **whole
file** with:

```ts

import { DocumentSection } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';

export interface Template {
  id: string;
  name: string;
  description: string | null;
}

export const SPECIALEBESKRIVELSER_TEMPLATE_SECTIONS = [
  { title: "1. Kort overordnet beskrivelse af specialet", content: "", order: 10 },
  { title: "2.1 Generelle opgaver", content: "", order: 20 },
  { title: "2.2 Kerneopgaver", content: "", order: 30 },
  { title: "3. Øvrige samarbejdende faggrupper", content: "", order: 40 },
  { title: "4. Forventet udvikling af teknologi og behandlingsmetoder", content: "", order: 50 },
  { title: "5. Arbejdsgruppens medlemmer", content: "", order: 60 },
  { title: "6. Anvendt materiale", content: "", order: 70 },
];

export const templateService = {
  // All templates available to build a document version on.
  getTemplates: async (): Promise<Template[]> => {
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, description')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }

    return (data || []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description ?? null,
    }));
  },

  // Get template sections for a document category
  getTemplateSections: (category: string): Omit<DocumentSection, 'id' | 'documentId' | 'createdAt' | 'updatedAt'>[] => {
    if (category === 'Specialebeskrivelser') {
      return SPECIALEBESKRIVELSER_TEMPLATE_SECTIONS;
    }
    return [];
  },

  // Check if a document should use a template
  hasTemplate: (category: string): boolean => {
    return category === 'Specialebeskrivelser';
  }
};
```

This swaps the old 12-section list for the 7-section structure from the current
specialebeskrivelse document, and adds `getTemplates()` so a template can be
chosen from a dropdown later.
