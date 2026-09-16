# Prompt 32 — structured Fællesopgaver: the importer

**Stage I**, the last of them. Requires prompts 29, 30 and 31.

**Guardrails:**

- Make only the changes described.
- `src/utils/docxImport/` must not import the Supabase client. The parser stays
  pure; the specialty matching happens in the dialog.

---

## What this does

The drafts already write Fællesopgaver as a bullet per specialty. The importer
now reads that: the introduction stays as the subsection's text and each
specialty becomes a row.

Measured over all 13 documents, its 642 Fællesopgaver paragraphs become:

| | count |
|---|---|
| collaboration entries | **589** |
| introduction paragraphs | 48 |
| prose that is neither, left with the introduction | 5 |

Nothing is dropped — the three add up — and **all 10 footnotes inside those
paragraphs survive** into the descriptions. 95 distinct specialty names, 7 of
them entries with no description at all.

### The two rules that were tuned, not guessed

**Split at the last plausible colon, not the first.** Danish specialty names
contain colons of their own — *"Intern medicin: hæmatologi og reumatologi:
Samarbejde ved …"* — and 101 of the entries are written that way. Splitting at
the first colon truncates the specialty for a sixth of them.

**Do not require the description to start with a capital.** It reads like a
sensible guard and is wrong: Danish descriptions often begin *"ved …"*, and
requiring it dropped the parse rate from 96% to 81%.

### Matching to the canonical list

Names are matched against `specialer` **case-insensitively and exactly**, never
fuzzily. A wrong link between two specialties is worse than no link, and an
unmatched name is already a supported state: it is stored as written, shown as
`fritekst` in the editor, and still searchable.

## 1. Create `src/utils/docxImport/collaborations.ts`

```ts
import { DocxBlock } from './types';

/**
 * Split the "Fællesopgaver med andre specialer" blocks into an introduction and
 * one entry per collaborating specialty.
 *
 * The drafts already write this subsection as a bullet per specialty —
 * "<speciale>: hvordan det er relevant" — so the structure is in the documents
 * and only needs recognising. Measured over all 13: 90% of its 642 paragraphs
 * are items, 8% introduction, 2% neither.
 *
 * Two rules were tuned against that corpus rather than guessed:
 *
 * 1. **Split at the LAST plausible colon, not the first.** Danish specialty
 *    names contain colons of their own — "Intern medicin: hæmatologi og
 *    reumatologi: Samarbejde ved …" — and 101 of the 578 items are written that
 *    way. Splitting at the first colon truncates the specialty for a sixth of
 *    them.
 * 2. **Do not require the description to start with a capital.** It reads like
 *    a sensible guard and is wrong: Danish descriptions often begin "ved …", and
 *    requiring it dropped the parse rate from 96% to 81%.
 */

const MAX_NAME = 100;

export interface ParsedCollaboration {
  specialtyName: string;
  /** The description, as blocks, so footnotes and marks inside it survive. */
  blocks: DocxBlock[];
}

export interface ParsedCollaborations {
  /** Paragraphs before the first recognised item: the section's introduction. */
  intro: DocxBlock[];
  items: ParsedCollaboration[];
  /** Paragraphs that are neither, once items had started. Prose that belongs in
   *  the introduction, usually. Reported rather than dropped. */
  unparsed: DocxBlock[];
}

/** `"Intern medicin: hæmatologi: Samarbejde ved …"` -> name and description. */
const splitAtName = (text: string): { name: string; description: string } | null => {
  const trimmed = text.trim();
  let found: { name: string; description: string } | null = null;

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== ':') continue;
    const name = trimmed.slice(0, i).trim();
    const description = trimmed.slice(i + 1).trim();
    if (!name || name.length > MAX_NAME || !description) continue;
    // Keep going rather than returning: the last qualifying colon is the one.
    found = { name, description };
  }
  if (found) return found;

  // A bare specialty name with no description at all. 15 items in the drafts.
  if (trimmed && trimmed.length <= MAX_NAME && !trimmed.includes(':')) {
    return { name: trimmed, description: '' };
  }
  return null;
};

/** The block with the name and its colon removed from the front, so the
 *  description keeps its formatting and any footnotes it carries. */
const descriptionBlock = (block: DocxBlock, name: string): DocxBlock => {
  const node = block.node as { type?: string; content?: Array<Record<string, unknown>> };
  const content = [...(node.content ?? [])];

  // Drop leading text nodes until the name and its colon are consumed. The name
  // is usually its own bold run, but it can share a run with the description.
  let remaining = name.length + 1;
  while (remaining > 0 && content.length > 0) {
    const first = content[0] as { type?: string; text?: string };
    if (first.type !== 'text' || typeof first.text !== 'string') break;
    if (first.text.length <= remaining) {
      remaining -= first.text.length;
      content.shift();
    } else {
      content[0] = { ...first, text: first.text.slice(remaining).replace(/^\s+/, '') };
      remaining = 0;
    }
  }

  return {
    ...block,
    listKind: null,
    text: block.text.slice(block.text.indexOf(name) + name.length + 1).trim(),
    node: { type: 'paragraph', content },
  };
};

export const splitCollaborations = (blocks: DocxBlock[]): ParsedCollaborations => {
  const intro: DocxBlock[] = [];
  const items: ParsedCollaboration[] = [];
  const unparsed: DocxBlock[] = [];

  for (const block of blocks) {
    const parsed = splitAtName(block.text);

    if (!parsed) {
      // Before the first item this is the introduction; after one it is prose
      // that could not be read as an item, and the review screen says so.
      (items.length === 0 ? intro : unparsed).push(block);
      continue;
    }

    items.push({
      specialtyName: parsed.name,
      blocks: parsed.description ? [descriptionBlock(block, parsed.name)] : [],
    });
  }

  return { intro, items, unparsed };
};
```

## 2. `src/utils/docxImport/types.ts`

Find:

```ts
import { NoteRun } from '@/utils/footnotes';
```

Replace with:

```ts
import { NoteRun } from '@/utils/footnotes';
import { ParsedCollaborations } from './collaborations';
```

Find:

```ts
export interface ParsedKerneopgaveSection {
  type: KerneopgaveSectionType;
  /** The heading exactly as it appeared, so the review screen can show a typo. */
  sourceHeading: string;
  /** Similarity of sourceHeading to the canonical name, 0–1. */
  confidence: number;
  blocks: DocxBlock[];
}
```

Replace with:

```ts
export interface ParsedKerneopgaveSection {
  type: KerneopgaveSectionType;
  /** The heading exactly as it appeared, so the review screen can show a typo. */
  sourceHeading: string;
  /** Similarity of sourceHeading to the canonical name, 0–1. */
  confidence: number;
  blocks: DocxBlock[];
  /** Only on 'faellesopgaver': the blocks split into an introduction and one
   *  entry per collaborating specialty. `blocks` still holds the original
   *  paragraphs, so nothing depends on this being present. */
  collaborations?: ParsedCollaborations;
}
```

## 3. `src/utils/docxImport/sectionSplitter.ts`

Find:

```ts
} from './types';
```

Replace with:

```ts
} from './types';
import { splitCollaborations } from './collaborations';
```

Find:

```ts
  for (const it of items) {
    if (it.sections.length === 0) {
```

Replace with:

```ts
  for (const it of items) {
    // Fællesopgaver is written as a bullet per specialty in the real drafts, so
    // it is split into an introduction and entries here rather than left as one
    // blob. The original blocks stay on the section either way.
    for (const section of it.sections) {
      if (section.type === 'faellesopgaver') {
        section.collaborations = splitCollaborations(section.blocks);
      }
    }

    if (it.sections.length === 0) {
```

## 4. `src/services/kerneopgaverService.ts`

Find:

```ts
/** One kerneopgave as the .docx importer produces it. */
```

Replace with:

```ts
/** What importKerneopgaver hands back. The subsection ids are what lets the
 *  caller attach collaborations to the faellesopgaver row it just created;
 *  `faellesopgaverSectionIds[i]` belongs to `items[i]`. */
export interface KerneopgaveImportResult {
  count: number;
  faellesopgaverSectionIds: Array<string | null>;
}

/** One kerneopgave as the .docx importer produces it. */
```

Find:

```ts
  ): Promise<number> {
    if (items.length === 0) return 0;
```

Replace with:

```ts
  ): Promise<KerneopgaveImportResult> {
    if (items.length === 0) return { count: 0, faellesopgaverSectionIds: [] };
```

Find:

```ts
    const { error: sectionError } = await supabase
      .from('kerneopgave_sections')
      .insert(sectionRows);

    if (sectionError) throw sectionError;

    return items.length;
  },
```

Replace with:

```ts
    // Select the rows back, so the caller can key collaborations to the
    // faellesopgaver subsection it just created. Ordered by the position of the
    // kerneopgave they belong to, so the ids line up with the items as given.
    const { data: created, error: sectionError } = await supabase
      .from('kerneopgave_sections')
      .insert(sectionRows)
      .select('id, kerneopgave_id, section_type');

    if (sectionError) throw sectionError;

    const faellesopgaverById = new Map<string, string>();
    for (const row of created || []) {
      if (row.section_type === 'faellesopgaver') {
        faellesopgaverById.set(row.kerneopgave_id, row.id);
      }
    }

    return {
      count: items.length,
      faellesopgaverSectionIds: items.map((_, index) => {
        const kerneopgaveId = idByPosition.get((index + 1) * 10) as string;
        return faellesopgaverById.get(kerneopgaveId) ?? null;
      }),
    };
  },
```

## 5. `src/services/collaborationsService.ts`

Find:

```ts
  async add(

```

Replace with:

```ts
  /** Bulk-create collaborations for an imported document, in one statement.
   *
   *  `specialtyId` is resolved by the caller against the canonical list; an
   *  unmatched name is stored with a null key rather than refused, which is the
   *  whole reason the name is the required half of the pair. */
  async importCollaborations(
    rows: Array<{
      kerneopgaveSectionId: string;
      position: number;
      specialtyId: number | null;
      specialtyName: string;
      draftDescription: string;
    }>
  ): Promise<number> {
    if (rows.length === 0) return 0;

    const { error } = await supabase.from('kerneopgave_collaborations').insert(
      rows.map(row => ({
        kerneopgave_section_id: row.kerneopgaveSectionId,
        position: row.position,
        specialty_id: row.specialtyId,
        specialty_name: row.specialtyName,
        draft_description: parseContent(row.draftDescription),
      }))
    );

    if (error) throw error;
    return rows.length;
  },

  /** Match a written name against the canonical list, case-insensitively.
   *  Deliberately exact rather than fuzzy: a wrong link between two specialties
   *  is worse than no link, and an unmatched name is already a supported state
   *  that the review screen reports. */
  matchSpecialty(name: string, specialer: Speciale[]): number | null {
    const wanted = name.trim().toLowerCase();
    return specialer.find(s => s.name.trim().toLowerCase() === wanted)?.id ?? null;
  },

  async add(

```

## 6. `src/components/DocumentImportDialog.tsx`

Find:

```tsx
} from '@/utils/docxImport/types';
```

Replace with:

```tsx
} from '@/utils/docxImport/types';
import { ParsedCollaboration } from '@/utils/docxImport/collaborations';
import { collaborationsService, Speciale } from '@/services/collaborationsService';
```

Find:

```tsx
const buildKerneopgavePayload = (
  kerneopgaver: ParsedKerneopgave[]
): { items: KerneopgaveImportItem[]; fallbackBlocks: DocxBlock[] } => {
  const items: KerneopgaveImportItem[] = [];
  const fallbackBlocks: DocxBlock[] = [];

  for (const item of kerneopgaver) {
    if (item.sections.length === 0) {
      fallbackBlocks.push(headingBlock(item.title), ...item.leadIn);
      continue;
    }

    const byType = new Map<KerneopgaveSectionType, DocxBlock[]>();
    for (const section of item.sections) {
      byType.set(section.type, [...(byType.get(section.type) ?? []), ...section.blocks]);
    }

    items.push({
      title: item.title,
      // Lead-in text goes on the item itself. It used to be prepended to
      // whichever subsection was detected first, which in geriatri meant 32
      // paragraphs of general description filed under "Fællesopgaver med andre
      // specialer" for seven of eight items.
      leadIn: blocksToJson(item.leadIn),
      sections: [...byType.entries()].map(([sectionType, blocks]) => ({
        sectionType,
        draftContent: blocksToJson(blocks),
      })),
    });
  }

  return { items, fallbackBlocks };
};
```

Replace with:

```tsx
const buildKerneopgavePayload = (
  kerneopgaver: ParsedKerneopgave[]
): {
  items: KerneopgaveImportItem[];
  fallbackBlocks: DocxBlock[];
  /** Aligned with `items`: the collaborating specialties parsed out of each
   *  item's Fællesopgaver subsection. They cannot be written until the
   *  subsection rows exist, so they travel alongside rather than inside. */
  collaborations: ParsedCollaboration[][];
} => {
  const items: KerneopgaveImportItem[] = [];
  const fallbackBlocks: DocxBlock[] = [];
  const collaborations: ParsedCollaboration[][] = [];

  for (const item of kerneopgaver) {
    if (item.sections.length === 0) {
      fallbackBlocks.push(headingBlock(item.title), ...item.leadIn);
      continue;
    }

    const byType = new Map<KerneopgaveSectionType, DocxBlock[]>();
    const parsedCollaborations: ParsedCollaboration[] = [];

    for (const section of item.sections) {
      // Fællesopgaver contributes only its introduction to the subsection text;
      // the specialties become rows of their own. Anything the splitter could
      // not read as an entry stays with the introduction rather than being
      // dropped — it is prose, and the review screen lists it.
      const blocks =
        section.type === 'faellesopgaver' && section.collaborations
          ? [...section.collaborations.intro, ...section.collaborations.unparsed]
          : section.blocks;

      if (section.type === 'faellesopgaver' && section.collaborations) {
        parsedCollaborations.push(...section.collaborations.items);
      }

      byType.set(section.type, [...(byType.get(section.type) ?? []), ...blocks]);
    }

    items.push({
      title: item.title,
      // Lead-in text goes on the item itself. It used to be prepended to
      // whichever subsection was detected first, which in geriatri meant 32
      // paragraphs of general description filed under "Fællesopgaver med andre
      // specialer" for seven of eight items.
      leadIn: blocksToJson(item.leadIn),
      sections: [...byType.entries()].map(([sectionType, blocks]) => ({
        sectionType,
        draftContent: blocksToJson(blocks),
      })),
    });
    collaborations.push(parsedCollaborations);
  }

  return { items, fallbackBlocks, collaborations };
};

/** What the Fællesopgaver subsection of one kerneopgave will turn into, for the
 *  review screen. Worth showing because the split is a judgement: 90% of the
 *  paragraphs in the real drafts read "<speciale>: hvordan", but the rest are
 *  prose, and a human should see which is which before anything is written. */
const collaborationSummary = (item: ParsedKerneopgave): string | null => {
  const section = item.sections.find(s => s.type === 'faellesopgaver');
  const parsed = section?.collaborations;
  if (!parsed || parsed.items.length === 0) return null;

  const names = parsed.items.map(entry => entry.specialtyName);
  const shown = names.slice(0, 4).join(', ');
  const rest = names.length > 4 ? ` +${names.length - 4} flere` : '';
  const unparsed = parsed.unparsed.length
    ? ` · ${parsed.unparsed.length} afsnit kunne ikke læses som et speciale og bliver i indledningen`
    : '';

  return `${names.length} samarbejdende specialer: ${shown}${rest}${unparsed}`;
};
```

Find:

```tsx
      const items = payloads.flatMap(payload => payload.items);
      if (items.length > 0) {
        await kerneopgaverService.importKerneopgaver(newDocumentId, items);
      }
```

Replace with:

```tsx
      const items = payloads.flatMap(payload => payload.items);
      const parsedCollaborations = payloads.flatMap(payload => payload.collaborations);

      if (items.length > 0) {
        const { faellesopgaverSectionIds } =
          await kerneopgaverService.importKerneopgaver(newDocumentId, items);

        // The subsection rows exist now, so the specialties can be keyed to
        // them. Names are matched against the canonical list; an unmatched name
        // is stored as written rather than refused.
        const specialer = await collaborationsService.listSpecialer().catch(() => [] as Speciale[]);
        const rows = parsedCollaborations.flatMap((list, index) => {
          const sectionId = faellesopgaverSectionIds[index];
          if (!sectionId) return [];
          return list.map((entry, position) => ({
            kerneopgaveSectionId: sectionId,
            position: (position + 1) * 10,
            specialtyId: collaborationsService.matchSpecialty(entry.specialtyName, specialer),
            specialtyName: entry.specialtyName,
            draftDescription: blocksToJson(entry.blocks),
          }));
        });

        if (rows.length > 0) await collaborationsService.importCollaborations(rows);
      }
```

Find:

```tsx
                          {kerneopgaveAnomalies([item]).map((note, aIndex) => (
                            <p key={`a${aIndex}`} className="text-xs text-amber-700">
                              {note}
                            </p>
                          ))}
```

Replace with:

```tsx
                          {kerneopgaveAnomalies([item]).map((note, aIndex) => (
                            <p key={`a${aIndex}`} className="text-xs text-amber-700">
                              {note}
                            </p>
                          ))}
                          {collaborationSummary(item) && (
                            <p className="text-xs text-gray-600">
                              {collaborationSummary(item)}
                            </p>
                          )}
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`, then re-import one of the documents —
geriatri or Pædiatri both have plenty of these.

1. In the review step each kerneopgave now shows a line like *"11 samarbejdende
   specialer: Akutmedicin, Kirurgi, Neurologi, Radiologi +7 flere"*, and says so
   when a paragraph could not be read as an entry.
2. After importing, open a kerneopgave: Fællesopgaver shows the introduction and
   the specialties as a list, names matched to `specialer` where they exist and
   badged `fritekst` where they do not.
3. Approve the document and search for a specialty by name — it should find it.
4. Check a footnote that lived inside one of those paragraphs still numbers
   correctly in the read view and in Word.

**Documents imported before this still hold their Fællesopgaver as one blob.**
Re-importing them as a new version is the way to pick up the split; the parser
is the only implementation of these rules, so there is no separate backfill to
keep in step with it.
