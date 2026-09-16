# Prompt 31 — structured Fællesopgaver: read view, export, search and Ask AI

**Stage H**. Requires prompts 29 and 30, and the types regenerated after 29.

**Order:** apply the code first, then run the SQL. The code changes touch no new
RPC, so they do not need another type regeneration.

**Guardrails:**

- Do not edit `supabase/functions/mcp/index.ts` — it is auto-generated; editing
  the tool files under `src/lib/mcp/tools/` is what makes the bundle follow.
- Make only the changes described.

---

## What this adds

After Stage G the collaboration rows existed and only the editor could see them.
Now they render everywhere a document does.

**In the read view and both exports** they become the bullet list the source
documents write by hand — `**Speciale**: hvordan det er relevant` — appended to
the subsection's introduction. Built as ordinary TipTap content rather than a new
block kind, so the renderer, both exporters and footnote numbering handle it with
no change at all. Verified in isolation:

- the introduction stays first, the list follows;
- a footnote inside a description survives into the bullet;
- an item with no description still renders its name — 15 items in the real
  drafts are exactly that;
- extra paragraphs in a description are kept, not flattened away;
- the approved export uses published descriptions and falls back to drafts for
  items never approved.

**In search and Ask AI**, both the specialty name and the description become
searchable, so "which documents work with radiologi" is finally a question the
data can answer. `get_document_text` emits one extra row per kerneopgave, titled
`… > Samarbejdende specialer`, joining the items into one readable line rather
than scattering fifteen two-word rows through the output.

### One asymmetry, on purpose

**Names are searchable regardless of approval; descriptions are not.** A name is
structure rather than prose — it is not draft-or-published — and this matches how
kerneopgave titles already behave. Verified on PostgreSQL 16:

| | before approval | after |
|---|---|---|
| specialty name `radiologi` | found | found |
| description word `ortogeriatrisk` | **not found** | found |
| free-text name `palliativ` (not in `specialer`) | found | found |

Say if you would rather names waited for approval too; it is a one-line change.

## 1. Run this in the Supabase SQL editor, then create `supabase/migrations/20260922090000-collaborations-in-search-and-ai.sql`

```sql
-- Collaborating specialties reach search and Ask AI.
--
-- Stage H of the structured-Fællesopgaver work. Requires 20260921090000.
--
-- The whole point of storing these as rows was to be able to ask which
-- specialties collaborate with which. That only works if the RPCs read them:
-- until now they read document_sections, kerneopgave_sections and kerneopgave
-- titles, and a collaboration lived in none of those.
--
-- Both the specialty NAME and the description are searchable. The name is the
-- more useful of the two — "which documents name radiologi" is the question this
-- feature exists to answer — and unlike the description it is not draft or
-- published, so it is matched regardless of approval. That matches how
-- kerneopgave titles already behave.
--
-- Descriptions follow the approval rule: only published_description is read.
--
-- Both indexes are new, so there is no stale-index hazard and no REINDEX.

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_published_fts_idx
  ON public.kerneopgave_collaborations
  USING gin (to_tsvector('danish', public.tiptap_to_text(published_description)));

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_name_fts_idx
  ON public.kerneopgave_collaborations
  USING gin (to_tsvector('danish', specialty_name));

CREATE OR REPLACE FUNCTION public.count_documents_containing(search_term text)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH hits AS (
    SELECT s.document_id
      FROM public.document_sections s
     WHERE to_tsvector('danish', public.tiptap_to_text(s.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
     WHERE to_tsvector('danish', public.tiptap_to_text(ks.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
     WHERE to_tsvector('danish', k.title) @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgave_collaborations kc
      JOIN public.kerneopgave_sections ks ON ks.id = kc.kerneopgave_section_id
      JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
     WHERE to_tsvector('danish', kc.specialty_name) @@ plainto_tsquery('danish', search_term)
        OR to_tsvector('danish', public.tiptap_to_text(kc.published_description))
           @@ plainto_tsquery('danish', search_term)
  )
  SELECT count(DISTINCT hits.document_id) FROM hits;
$$;

CREATE OR REPLACE FUNCTION public.search_documents(search_term text)
RETURNS TABLE (document_id uuid, title text, matches bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH hits AS (
    SELECT s.document_id
      FROM public.document_sections s
     WHERE to_tsvector('danish', public.tiptap_to_text(s.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
     WHERE to_tsvector('danish', public.tiptap_to_text(ks.published_content))
           @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgaver k
     WHERE to_tsvector('danish', k.title) @@ plainto_tsquery('danish', search_term)
    UNION ALL
    SELECT k.document_id
      FROM public.kerneopgave_collaborations kc
      JOIN public.kerneopgave_sections ks ON ks.id = kc.kerneopgave_section_id
      JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
     WHERE to_tsvector('danish', kc.specialty_name) @@ plainto_tsquery('danish', search_term)
        OR to_tsvector('danish', public.tiptap_to_text(kc.published_description))
           @@ plainto_tsquery('danish', search_term)
  )
  SELECT d.id, d.title, count(*) AS matches
    FROM public.documents d
    JOIN hits ON hits.document_id = d.id
   GROUP BY d.id, d.title
   ORDER BY matches DESC;
$$;

-- Collaborations are emitted as one row per kerneopgave, joined into a single
-- readable line, rather than one row per specialty. The model reads this as
-- prose, and fifteen separate two-word rows would be noise where one line saying
-- "collaborates with Radiologi: ..., Anæstesiologi: ..." is not.
CREATE OR REPLACE FUNCTION public.get_document_text(doc_id uuid)
RETURNS TABLE (title text, section_title text, body text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH doc AS (
    SELECT d.id, d.title, d.template_id FROM public.documents d WHERE d.id = doc_id
  ),
  kerne AS (
    SELECT ts.name, ts.position
      FROM public.template_sections ts
      JOIN doc ON ts.template_id = doc.template_id
     WHERE ts.section_key = 'kerneopgaver'
     LIMIT 1
  )
  SELECT x.title, x.section_title, x.body FROM (
    SELECT doc.title,
           coalesce(ts.name, 'Untitled section') AS section_title,
           public.tiptap_to_text(s.published_content) AS body,
           coalesce(ts.position, 2147483647) AS p1, 0 AS p2, 0 AS p3
      FROM doc
      JOIN public.document_sections s ON s.document_id = doc.id
      LEFT JOIN public.template_sections ts ON ts.id = s.template_section_id
    UNION ALL
    SELECT doc.title,
           coalesce((SELECT kerne.name FROM kerne), 'Kerneopgaver')
             || ' > ' || k.title
             || ' > ' || coalesce(l.label, ks.section_type) AS section_title,
           public.tiptap_to_text(ks.published_content) AS body,
           coalesce((SELECT kerne.position FROM kerne), 2147483646) AS p1,
           k.position AS p2,
           coalesce(l.position, 0) AS p3
      FROM doc
      JOIN public.kerneopgaver k ON k.document_id = doc.id
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
      LEFT JOIN public.kerneopgave_section_labels l ON l.section_type = ks.section_type
     WHERE ks.published_content IS NOT NULL
    UNION ALL
    SELECT doc.title,
           coalesce((SELECT kerne.name FROM kerne), 'Kerneopgaver')
             || ' > ' || k.title
             || ' > Samarbejdende specialer' AS section_title,
           string_agg(
             kc.specialty_name
               || CASE
                    WHEN coalesce(public.tiptap_to_text(kc.published_description), '') = '' THEN ''
                    ELSE ': ' || public.tiptap_to_text(kc.published_description)
                  END,
             ' | ' ORDER BY kc.position, kc.specialty_name) AS body,
           coalesce((SELECT kerne.position FROM kerne), 2147483646) AS p1,
           k.position AS p2,
           -- Immediately after the faellesopgaver subsection it belongs to.
           coalesce((SELECT l2.position FROM public.kerneopgave_section_labels l2
                      WHERE l2.section_type = 'faellesopgaver'), 50) + 1 AS p3
      FROM doc
      JOIN public.kerneopgaver k ON k.document_id = doc.id
      JOIN public.kerneopgave_sections ks ON ks.kerneopgave_id = k.id
      JOIN public.kerneopgave_collaborations kc ON kc.kerneopgave_section_id = ks.id
     GROUP BY doc.title, k.title, k.position
  ) x
  ORDER BY x.p1, x.p2, x.p3;
$$;

GRANT EXECUTE ON FUNCTION public.count_documents_containing(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_documents(text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_text(uuid)         TO authenticated;
```

## 2. `src/services/collaborationsService.ts`

Find:

```ts
  /** The canonical specialty list.
```

Replace with:

```ts
  /** Every collaboration for a set of subsection rows, grouped by subsection.
   *  One query for a whole document rather than one per kerneopgave: a document
   *  has up to fifteen of them. */
  async listForSections(
    kerneopgaveSectionIds: string[]
  ): Promise<Map<string, Collaboration[]>> {
    const grouped = new Map<string, Collaboration[]>();
    if (kerneopgaveSectionIds.length === 0) return grouped;

    const { data, error } = await supabase
      .from('kerneopgave_collaborations')
      .select('*')
      .in('kerneopgave_section_id', kerneopgaveSectionIds)
      .order('position');

    if (error) throw error;

    for (const row of data || []) {
      const item = toCollaboration(row);
      const list = grouped.get(item.kerneopgaveSectionId) ?? [];
      list.push(item);
      grouped.set(item.kerneopgaveSectionId, list);
    }
    return grouped;
  },

  /** The canonical specialty list.
```

## 3. `src/services/kerneopgaverService.ts`

Find:

```ts
import { supabase } from '@/integrations/supabase/client';
```

Replace with:

```ts
import { supabase } from '@/integrations/supabase/client';
import type { Collaboration } from '@/services/collaborationsService';
```

Find:

```ts
  publishedContent: string;
  isApproved: boolean;
  updatedAt: string;
}
```

Replace with:

```ts
  publishedContent: string;
  isApproved: boolean;
  /** Only the 'faellesopgaver' subsection has these, and only when the caller
   *  asked for them — documentContent.fetchKerneopgaver attaches them. They are
   *  a type-only dependency here; nothing in this service reads the table. */
  collaborations?: Collaboration[];
  updatedAt: string;
}
```

## 4. `src/utils/documentContent.ts`

Find:

```ts
} from '@/services/kerneopgaverService';
```

Replace with:

```ts
} from '@/services/kerneopgaverService';
import { Collaboration, collaborationsService } from '@/services/collaborationsService';
```

Find:

```ts
export const fetchKerneopgaver = async (documentId: string): Promise<Kerneopgave[]> => {
  try {
    return await kerneopgaverService.getKerneopgaver(documentId);
  } catch (error) {
    console.error('Error loading kerneopgaver for document content:', error);
    return [];
  }
};
```

Replace with:

```ts
export const fetchKerneopgaver = async (documentId: string): Promise<Kerneopgave[]> => {
  try {
    const kerneopgaver = await kerneopgaverService.getKerneopgaver(documentId);

    // The collaborating specialties under 'faellesopgaver' are rows of their
    // own. Fetched in one query for the whole document and attached here, so
    // every consumer of this list — read view and both exporters — gets them
    // without knowing the table exists.
    const sectionIds = kerneopgaver
      .flatMap(item => item.sections)
      .filter(section => section.sectionType === 'faellesopgaver')
      .map(section => section.id)
      .filter(Boolean);

    const grouped = await collaborationsService.listForSections(sectionIds);
    for (const item of kerneopgaver) {
      for (const section of item.sections) {
        if (section.sectionType === 'faellesopgaver') {
          section.collaborations = grouped.get(section.id) ?? [];
        }
      }
    }

    return kerneopgaver;
  } catch (error) {
    console.error('Error loading kerneopgaver for document content:', error);
    return [];
  }
};

type InlineNode = Record<string, unknown>;

const parseDoc = (json: string): { content?: InlineNode[] } | null => {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};

/**
 * Turn the collaboration rows into the bullet list the source documents write by
 * hand: "**Speciale**: hvordan det er relevant".
 *
 * Built as TipTap content rather than as its own block kind so that everything
 * downstream — the renderer, both exporters, footnote numbering — handles it
 * with no change at all. The description's inline nodes are reused rather than
 * flattened, which is what keeps the footnotes inside them working.
 *
 * An item with no description still renders: the specialty name is the point of
 * the row, and 15 of the items in the real drafts are exactly that.
 */
const collaborationsToList = (
  items: Collaboration[],
  preferPublished: boolean
): InlineNode | null => {
  if (items.length === 0) return null;

  const listItems = items.map(item => {
    const json = preferPublished
      ? item.publishedDescription || item.draftDescription
      : item.draftDescription;
    const paragraphs = (parseDoc(json)?.content ?? []) as Array<{ content?: InlineNode[] }>;

    const label: InlineNode[] = [
      { type: 'text', text: item.specialtyName, marks: [{ type: 'bold' }] },
    ];
    const [first, ...rest] = paragraphs;
    if (first?.content?.length) label.push({ type: 'text', text: ': ' }, ...first.content);

    return {
      type: 'listItem',
      content: [{ type: 'paragraph', content: label }, ...rest],
    };
  });

  return { type: 'bulletList', content: listItems };
};

/** The subsection's own rich text is the introduction; the list follows it in
 *  the same block, so an empty introduction with items still renders. */
const withCollaborations = (
  introJson: string,
  items: Collaboration[] | undefined,
  preferPublished: boolean
): string => {
  const list = collaborationsToList(items ?? [], preferPublished);
  if (!list) return introJson;

  const intro = parseDoc(introJson);
  return JSON.stringify({
    type: 'doc',
    content: [...((intro?.content as InlineNode[]) ?? []), list],
  });
};
```

Find:

```ts
          content: subsectionContent(sub),
```

Replace with:

```ts
          content:
            type === 'faellesopgaver'
              ? withCollaborations(subsectionContent(sub), sub?.collaborations, preferPublished)
              : subsectionContent(sub),
```

## 5. `supabase/functions/query-documents/index.ts`

Find:

```ts
      "Find which documents contain a word/phrase. Searches the approved text of every section, including the kerneopgaver in section 2.2/2.3 and their titles. Returns document ids, titles and match counts.",
```

Replace with:

```ts
      "Find which documents contain a word/phrase. Searches the approved text of every section, including the kerneopgaver in section 2.2/2.3, their titles, and the specialties each kerneopgave collaborates with. Use it to answer "which documents work with <specialty>". Returns document ids, titles and match counts.",
```

Find:

```ts
      "Get the full approved text of one document by id, section by section. Use to read or compare specific documents. Kerneopgaver appear as their own rows, titled '<section> > <kerneopgave> > <subsection>', in place rather than at the end — that is section 2.2 or 2.3 and usually the largest part of the document. Any footnotes appear at the end of a section's body as '[FN: ... | ...]', separated by ' | ' — treat those as footnotes, not as running prose.",
```

Replace with:

```ts
      "Get the full approved text of one document by id, section by section. Use to read or compare specific documents. Kerneopgaver appear as their own rows, titled '<section> > <kerneopgave> > <subsection>', in place rather than at the end — that is section 2.2 or 2.3 and usually the largest part of the document. A row titled '… > Samarbejdende specialer' lists the specialties that kerneopgave collaborates with, as 'Speciale: hvordan', separated by ' | '. Any footnotes appear at the end of a section's body as '[FN: ... | ...]', separated by ' | ' — treat those as footnotes, not as running prose.",
```

## 6. `src/lib/mcp/tools/search-documents.ts`

Find:

```ts
    "Full-text search the approved document text for a word or phrase, including the kerneopgaver in section 2.2/2.3 and their titles. Returns matching document ids, titles and match counts.",
```

Replace with:

```ts
    "Full-text search the approved document text for a word or phrase, including the kerneopgaver in section 2.2/2.3, their titles, and the specialties each kerneopgave collaborates with. Returns matching document ids, titles and match counts.",
```

## 7. `src/lib/mcp/tools/get-document-text.ts`

Find:

```ts
    "Get the full approved text of one document by id, section by section. Find the id with find_documents_by_title, search_documents or list_documents first. Kerneopgaver appear as their own rows, titled '<section> > <kerneopgave> > <subsection>', in place rather than at the end — that is section 2.2 or 2.3 and usually the largest part of the document. Any footnotes appear at the end of a section's body as '[FN: ... | ...]', separated by ' | ' — treat those as footnotes, not as running prose.",
```

Replace with:

```ts
    "Get the full approved text of one document by id, section by section. Find the id with find_documents_by_title, search_documents or list_documents first. Kerneopgaver appear as their own rows, titled '<section> > <kerneopgave> > <subsection>', in place rather than at the end — that is section 2.2 or 2.3 and usually the largest part of the document. A row titled '… > Samarbejdende specialer' lists the specialties that kerneopgave collaborates with, as 'Speciale: hvordan', separated by ' | '. Any footnotes appear at the end of a section's body as '[FN: ... | ...]', separated by ' | ' — treat those as footnotes, not as running prose.",
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`, then on a document with collaboration
items:

1. The read view shows the Fællesopgaver introduction followed by a bullet per
   specialty, the name in bold.
2. Export to Word: the same list, and a footnote inside a description keeps its
   number in the continuous sequence.
3. Approve the document, then search for a word that appears only in one of the
   descriptions — it should now be found, and should not have been before.
4. Ask AI "hvilke specialer samarbejder <speciale> med?" and check it answers
   from the `Samarbejdende specialer` rows.

Imported documents still show their Fællesopgaver as one blob until Stage I
teaches the importer to split it.
