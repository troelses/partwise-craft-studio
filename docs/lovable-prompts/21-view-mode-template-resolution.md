# Prompt 21 — fix: view mode is blank for documents not on the original template

One file: `src/components/DocumentContinuousView.tsx`. No schema change.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- If a "find this" block does not match the file exactly, stop and report it.

---

## What is wrong

`DocumentContinuousView` fetches its template sections with the **original
template's id hardcoded**:

```ts
.eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
```

Any document on a different template therefore matches no `template_sections`
rows at all, so every section comes out as an empty placeholder.

This affects **every document on the current default template**
(`specialebeskrivelse_310826`) as well as the Intern medicin ones — not only
imported documents. Prompt 2 moved the editor and `documentService` onto
per-document template resolution; this component was missed, and both of those
resolve `documents.template_id || DEFAULT_TEMPLATE_ID` today.

It has been broken since the second template existed, but it looked different
before prompt 18: the view rendered a column of headings each saying "No content
available for this section". Once empty blocks started being hidden, the same
failure became a completely blank page.

## 1. Import the constant

Find:

```ts
import { Kerneopgave } from '@/services/kerneopgaverService';
```

Replace with:

```ts
import { Kerneopgave } from '@/services/kerneopgaverService';
import { DEFAULT_TEMPLATE_ID } from '@/constants/template';
```

## 2. Resolve the template from the document

Find:

```ts
      // Fetch template sections
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
        .order('position');
```

Replace with:

```ts
      // Resolve against the document's own template, the same way the editor
      // and documentService do. This was hardcoded to the original template, so
      // any document on a different one matched no template_sections at all and
      // rendered as a page of empty headings — and, once empty blocks started
      // being hidden, as nothing whatsoever.
      const { data: documentData, error: documentError } = await supabase
        .from('documents')
        .select('template_id')
        .eq('id', document.id)
        .single();

      if (documentError) {
        throw documentError;
      }

      const templateId = documentData?.template_id || DEFAULT_TEMPLATE_ID;

      // Fetch template sections
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', templateId)
        .order('position');
```

## 3. Say so when there really is nothing

A document with no content at all now renders as a blank page, which is exactly
the ambiguity that made this hard to diagnose — "nothing shows up" could mean
broken or empty. Find:

```tsx
      {/* Document sections */}
      <div className="space-y-6">
        {cards.map((card) => (
```

Replace with:

```tsx
      {/* Document sections */}
      {cards.length === 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm text-center text-gray-500">
          <p>Dokumentet har intet indhold endnu.</p>
          <p className="text-sm mt-1">
            Tomme afsnit vises ikke her. Skriv indhold i redigeringsvisningen, så
            vises det.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {cards.map((card) => (
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`, then open the geriatri document in view
mode: its sections, kerneopgaver and footnotes should all appear. Check a
document on the standard `specialebeskrivelse_310826` template too — it was
affected by the same bug.

A document that genuinely has no content should now say so rather than showing
an empty page.
