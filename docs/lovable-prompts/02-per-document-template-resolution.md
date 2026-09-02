# Prompt 2 — Render each document against its own template

Requires prompt 1.

Today three places hardcode the template id `439df5fa-9aa6-4c2f-bb71-f26fa4b29f03`.
Now that a second template exists (`specialebeskrivelse_310826`), a document must
be rendered against the template it was actually created with, and lists must show
only the current version of each document.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- Do not touch the MCP integration, `query-documents`, or `document_access` logic.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


---

## 1. `src/components/DocumentEditor/hooks/useDocumentSections.ts`

**a. Add the import** at the top, after the `use-toast` import:

```ts
import { DEFAULT_TEMPLATE_ID } from '@/constants/template';
```

**b. Add `section_key` to the `TemplateSection` interface:**

Find:

```ts
interface TemplateSection {
  id: string;
  name: string;
  position: number;
  level: number;
  description?: string;
}
```

Replace with:

```ts
interface TemplateSection {
  id: string;
  name: string;
  position: number;
  level: number;
  description?: string;
  section_key?: string | null;
}
```

**c. Resolve the template from the document.** Find:

```ts
      setIsLoading(true);
      
      // Fetch template sections with description
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
        .order('position');
```

Replace with:

```ts
      setIsLoading(true);

      // Resolve the template from the document itself, so documents created with
      // an older template keep rendering their original section structure.
      const { data: documentData, error: documentError } = await supabase
        .from('documents')
        .select('template_id')
        .eq('id', documentId)
        .single();

      if (documentError) {
        throw documentError;
      }

      const templateId = documentData?.template_id || DEFAULT_TEMPLATE_ID;

      // Fetch template sections with description
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', templateId)
        .order('position');
```

**Note — no mapping change is needed.** This hook passes the template row
through with the `templateSection` shorthand, and the query is `select('*')`, so
`section_key` already reaches the component once the interface above declares it.

## 2. `src/services/documentService.ts`

**a. Add the import** at the top:

```ts
import { DEFAULT_TEMPLATE_ID } from '@/constants/template';
```

**b. List only current versions.** In `getDocuments`, find:

```ts
        `)
        .order('created_at', { ascending: false });
```

Replace with:

```ts
        `)
        // Only the current version of each document appears in listings.
        .eq('is_current', true)
        .order('created_at', { ascending: false });
```

**c. In `getDocument`,** find:

```ts
      // First, get the template sections to define the structure
      const { data: templateSections, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
        .order('position');
```

Replace with:

```ts
      // First, get the template sections to define the structure. Resolve against
      // the document's own template so documents created with an older template
      // keep rendering their original section structure.
      const { data: templateSections, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', docData.template_id || DEFAULT_TEMPLATE_ID)
        .order('position');
```

**d. In `createDocument`,** find:

```ts
          template_id: '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
```

Replace with:

```ts
          template_id: DEFAULT_TEMPLATE_ID,
```

## 3. `src/components/SpecialtyList.tsx`

This list currently filters on the old template id, which would hide every
document built on the new template.

**a.** Find:

```ts
        // Fetch documents with the specific template ID
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
          .order('title');
```

Replace with:

```ts
        // List the current version of every document, regardless of which
        // template that version is built on.
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('is_current', true)
          .order('title');
```

**b. Add a version badge.** In the local `Document` interface add `version_number: number;`
after `template_id: string;`. Then find:

```tsx
                <TableCell className="flex items-center gap-2">
                  <span>{document.title}</span>
                </TableCell>
```

Replace with:

```tsx
                <TableCell className="flex items-center gap-2">
                  <span>{document.title}</span>
                  {document.version_number > 1 && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      v{document.version_number}
                    </span>
                  )}
                </TableCell>
```

**Do not** re-add the row `onClick`, the highlight class, or the check-mark icon
that were deliberately removed from this component.
