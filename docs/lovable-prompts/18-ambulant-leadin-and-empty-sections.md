# Prompt 18 — Ambulant subsection, kerneopgave lead-in, and hiding empty sections

**Run the migration in section 1 first.** This project has no compile-time
checking of database column names — `tsconfig.app.json` sets `strict: false` and
`noImplicitAny: false`, which degenerates the Supabase generics far enough that
`tsc` accepts a column that does not exist (verified). A passing typecheck
therefore says nothing about whether `lead_in` is there; only the migration does.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model or regenerate RLS.
- If a "find this" block does not match the file exactly, stop and report it.

---

## What this changes, and why

**1. A sixth subsection, `Ambulant`, between Sygehus and Fællesopgaver.**
It does not appear in any of the 13 draft documents I have — the only paragraph
containing the word is a Heading 4 in section 4 of lungesygdomme — so this is
added on your say-so, for newer drafts. No existing document is affected: every
item simply gets one more empty row.

**2. Lead-in text moves onto the kerneopgave itself.** Text under a kerneopgave
that precedes any named subsection heading had nowhere to live, so the importer
prepended it to whichever subsection was detected first. In geriatri that is
*"Fællesopgaver med andre specialer"* for seven of eight items, so 32 paragraphs
of general description were filed under a heading they have nothing to do with.
A new `lead_in` column carries it, the editor gains an "Indledning" field, and
the read view and both exports render it above the subsections.

Measured across all 13 documents: 11 items carry lead-in text — 7 in geriatri,
2 in Børne, 1 each in Neurologi and lungesygdomme. The other 115 are unaffected.

**3. The read view hides empty sections and subsections.** Most documents fill
three to five of the six subsections, and a page of bare headings is noise. A
heading survives if anything beneath it does, so an empty kerneopgaver section
still renders when it has items. This cannot disturb footnote numbering: a block
with no content carries no footnotes.

That last point is also why **both exporters now write a kerneopgave title's
body when it has one**. `blockContents()` counts lead-in for numbering, so
skipping it in Word would have made the Word numbers disagree with the screen.

## 1. Run this in the Supabase SQL editor, then create `supabase/migrations/20260915120000-kerneopgave-ambulant-and-leadin.sql`

```sql
-- Two additions to the kerneopgave model, both driven by the real documents.
--
-- 1. A sixth subsection, "Ambulant", between Sygehus and Fællesopgaver.
--
-- 2. lead_in on kerneopgaver: the text that appears under a kerneopgave before
--    any named subsection heading. It had nowhere to live, so the importer
--    prepended it to whichever subsection happened to be detected first. In
--    geriatri that is "Fællesopgaver med andre specialer" for seven of eight
--    items, so 32 paragraphs of general description were filed under a heading
--    they have nothing to do with. It belongs to the kerneopgave as a whole.
--
-- Both are additive. No existing row changes: lead_in defaults to NULL, and
-- widening a CHECK constraint cannot invalidate rows that already satisfy it.
-- Idempotent; safe to re-run.

ALTER TABLE public.kerneopgaver
  ADD COLUMN IF NOT EXISTS lead_in jsonb;

-- The original constraint was declared inline, so it carries whatever name
-- Postgres generated. Find it by what it constrains rather than by guessing.
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
```

## 2. Regenerate the Supabase types

`lead_in` is a new column. See `06-supabase-types.md`. The build will not fail
without it — see the note at the top — but the types should describe the schema.

## 3. `src/constants/kerneopgaver.ts`

Replace the whole file with:

```ts
/**
 * The fixed subsections of a kerneopgave.
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
  | 'ambulant'
  | 'faellesopgaver'
  | 'fremtidig_varetagelse';

export const KERNEOPGAVE_SECTION_LABELS: Record<KerneopgaveSectionType, string> = {
  almenmedicinske_tilbud: 'Almenmedicinske tilbud',
  speciallaegepraksis:    'Speciallægepraksis',
  sygehus:                'Sygehus',
  ambulant:               'Ambulant',
  faellesopgaver:         'Fællesopgaver med andre specialer',
  fremtidig_varetagelse:  'Fremtidig varetagelse',
};

export const KERNEOPGAVE_SECTION_TYPES: KerneopgaveSectionType[] = [
  'almenmedicinske_tilbud',
  'speciallaegepraksis',
  'sygehus',
  'ambulant',
  'faellesopgaver',
  'fremtidig_varetagelse',
];
```

## 4. `src/services/kerneopgaverService.ts`

Find:

```ts
export interface Kerneopgave {
  id: string;
  documentId: string;
  title: string;
  position: number;
```

Replace with:

```ts
export interface Kerneopgave {
  id: string;
  documentId: string;
  title: string;
  /** Text belonging to the kerneopgave as a whole, shown above its subsections.
   *  Imported documents put the paragraphs that precede any named subsection
   *  heading here rather than filing them under an arbitrary subsection. */
  leadIn: string;
  position: number;
```

Find:

```ts
      title: k.title,
      position: k.position,
      createdAt: k.created_at,
```

Replace with:

```ts
      title: k.title,
      leadIn: k.lead_in ? JSON.stringify(k.lead_in) : '',
      position: k.position,
      createdAt: k.created_at,
```

Find:

```ts
      title: (k as any).title,
      position: (k as any).position,
```

Replace with:

```ts
      title: (k as any).title,
      leadIn: '',
      position: (k as any).position,
```

Find:

```ts
export interface KerneopgaveImportItem {
  title: string;
  sections: KerneopgaveImportSection[];
}
```

Replace with:

```ts
export interface KerneopgaveImportItem {
  title: string;
  /** TipTap document as a JSON string; empty when the item has no lead-in. */
  leadIn: string;
  sections: KerneopgaveImportSection[];
}
```

Find:

```ts
          document_id: documentId,
          title: item.title,
          position: (index + 1) * 10,
```

Replace with:

```ts
          document_id: documentId,
          title: item.title,
          lead_in: parseDraftContent(item.leadIn),
          position: (index + 1) * 10,
```

Find:

```ts
  async updateKerneopgaveTitle(id: string, title: string): Promise<void> {
```

Replace with:

```ts
  /** The kerneopgave's own text, above its subsections. */
  async updateKerneopgaveLeadIn(id: string, leadIn: string): Promise<void> {
    const { error } = await supabase
      .from('kerneopgaver')
      .update({ lead_in: parseDraftContent(leadIn), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async updateKerneopgaveTitle(id: string, title: string): Promise<void> {
```

## 5. `src/utils/documentContent.ts`

Find:

```ts
      blocks.push({
        key: `kerneopgave-${item.id}`,
        kind: 'kerneopgaveTitle',
        title: item.title,
        content: '',
        depth: 1,
      });
```

Replace with:

```ts
      blocks.push({
        key: `kerneopgave-${item.id}`,
        kind: 'kerneopgaveTitle',
        title: item.title,
        // The item's own text, above its subsections. Empty for most items.
        content: item.leadIn || '',
        depth: 1,
      });
```

Find:

```ts
      // Always emit the five subsections in their canonical order, so a
      // kerneopgave reads the same everywhere even if a row is missing.
```

Replace with:

```ts
      // Always emit every subsection in canonical order, so a kerneopgave reads
      // the same everywhere even if a row is missing. Use hideEmptyBlocks to
      // drop the ones with nothing in them.
```

Find:

```ts
/** The content strings in document order — the input to footnote numbering. */
```

Replace with:

```ts
/**
 * Drop blocks with no content of their own.
 *
 * Most documents fill only three to five of the six subsections, and an export
 * or a read view full of empty headings is noise. Safe with respect to footnote
 * numbering by construction: a block with no content contains no footnotes, so
 * removing it cannot renumber anything.
 *
 * A heading is kept whenever something beneath it survives — an empty
 * kerneopgaver section still renders if it has items, and an item with no
 * lead-in still renders if any subsection has text.
 */
export const hideEmptyBlocks = (blocks: ContentBlock[]): ContentBlock[] => {
  const keep = new Array<boolean>(blocks.length).fill(false);

  // Walk backwards so a heading can see whether anything under it survived.
  let sectionHasContent = false;
  let itemHasContent = false;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const hasOwn = block.content.trim() !== '';

    if (block.kind === 'kerneopgaveSection') {
      keep[i] = hasOwn;
      if (hasOwn) { itemHasContent = true; sectionHasContent = true; }
      continue;
    }

    if (block.kind === 'kerneopgaveTitle') {
      keep[i] = hasOwn || itemHasContent;
      if (keep[i]) sectionHasContent = true;
      itemHasContent = false;
      continue;
    }

    keep[i] = hasOwn || sectionHasContent;
    sectionHasContent = false;
    itemHasContent = false;
  }

  return blocks.filter((_, i) => keep[i]);
};

/** The content strings in document order — the input to footnote numbering. */
```

## 6. `src/components/DocumentContinuousView.tsx`

Find:

```ts
  buildContentBlocks,
  blockContents,
```

Replace with:

```ts
  buildContentBlocks,
  blockContents,
  hideEmptyBlocks,
```

Find:

```tsx
  const blocks = buildContentBlocks(
```

Replace with:

```tsx
  // Empty sections and subsections are hidden here rather than rendered as bare
  // headings. Most documents fill only three to five of the six kerneopgave
  // subsections, and this is a read view. Numbering is unaffected: a block with
  // no content carries no footnotes.
  const blocks = hideEmptyBlocks(buildContentBlocks(
```

Find:

```tsx
    kerneopgaver
  );

  // Footnote numbering runs continuously
```

Replace with:

```tsx
    kerneopgaver
  ));

  // Footnote numbering runs continuously
```

Find:

```tsx
                {block.kind !== 'kerneopgaveTitle' && (
```

Replace with:

```tsx
                {/* A kerneopgave title has a body only when the item carries
                    lead-in text; without it the heading stands alone. */}
                {(block.kind !== 'kerneopgaveTitle' || block.content) && (
```

## 7. `src/utils/documentExporter.ts`

Find:

```ts
      if (block.kind === 'kerneopgaveTitle') continue;

      const paragraphs = contentToParagraphs(
```

Replace with:

```ts
      // A kerneopgave title carries a body only when the item has lead-in text.
      // It must be written when present: blockContents() counts it for footnote
      // numbering, so skipping it would make the Word numbers disagree with the
      // screen.
      if (block.kind === 'kerneopgaveTitle' && !block.content) continue;

      const paragraphs = contentToParagraphs(
```

Find:

```ts
      if (block.kind === 'kerneopgaveTitle') continue;
      const text = contentToPlainText(
```

Replace with:

```ts
      if (block.kind === 'kerneopgaveTitle' && !block.content) continue;
      const text = contentToPlainText(
```

## 8. `src/components/DocumentEditor/KerneopgaveItem.tsx`

Find:

```tsx
  const [editingSection, setEditingSection] = useState<KerneopgaveSectionType | null>(null);
```

Replace with:

```tsx
  const [editingSection, setEditingSection] = useState<KerneopgaveSectionType | null>(null);
  // The item's own text, above the subsections. `null` when not being edited.
  const [leadIn, setLeadIn] = useState<string | null>(null);
```

Find:

```tsx
  const handleCancel = (type: KerneopgaveSectionType) => {
```

Replace with:

```tsx
  const handleSaveLeadIn = async () => {
    if (leadIn === null) return;
    setIsSaving(true);
    try {
      await kerneopgaverService.updateKerneopgaveLeadIn(kerneopgave.id, leadIn);
      setLeadIn(null);
      await onUpdate();
      toast({ title: 'Gemt' });
    } catch {
      toast({ title: 'Fejl', description: 'Kunne ikke gemme', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = (type: KerneopgaveSectionType) => {
```

Find:

```tsx
        <div className="border-t p-4 space-y-6">
          {KERNEOPGAVE_SECTION_TYPES.map(type => {
```

Replace with:

```tsx
        <div className="border-t p-4 space-y-6">
          {/* Introduction to the kerneopgave itself. Imported documents put the
              paragraphs that precede any named subsection heading here, rather
              than filing them under whichever subsection happened to come
              first. */}
          <div>
            <div className="flex items-start justify-between">
              <h5 className="text-sm font-semibold mb-2">Indledning</h5>
              {leadIn === null && (
                <Button variant="ghost" size="icon" onClick={() => setLeadIn(kerneopgave.leadIn)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {leadIn !== null ? (
              <div className="space-y-3">
                <RichTextEditor
                  content={leadIn}
                  onChange={setLeadIn}
                  placeholder="Indledende beskrivelse af kerneopgaven…"
                />
                <div className="flex space-x-2 justify-end">
                  <Button variant="outline" onClick={() => setLeadIn(null)}>Annuller</Button>
                  <Button onClick={handleSaveLeadIn} disabled={isSaving}>
                    {isSaving ? 'Gemmer…' : <><Save className="h-4 w-4 mr-1" /> Gem</>}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="prose max-w-none">
                {kerneopgave.leadIn
                  ? renderRichText(kerneopgave.leadIn)
                  : <span className="text-gray-400 italic">Intet indhold endnu</span>}
              </div>
            )}
          </div>

          {KERNEOPGAVE_SECTION_TYPES.map(type => {
```

## 9. `src/components/DocumentImportDialog.tsx`

Find:

```tsx
 * - An item with no recognised subsections is not a kerneopgave. Its heading and
 *   text go into the section body instead, which is what it actually is.
```

Replace with:

```tsx
 * - An item with no recognised subsections is not a kerneopgave. Its heading and
 *   text go into the section body instead, which is what it actually is.
 * - Text before the first recognised subsection belongs to the item, not to a
 *   subsection, and is carried on the item's own lead_in.
```

Find:

```tsx
    const byType = new Map<KerneopgaveSectionType, DocxBlock[]>();
    item.sections.forEach((section, index) => {
      // Content before the first recognised subsection heading is prepended to
      // that subsection rather than dropped — there is nowhere else to put it.
      const blocks = index === 0 ? [...item.leadIn, ...section.blocks] : section.blocks;
      byType.set(section.type, [...(byType.get(section.type) ?? []), ...blocks]);
    });

    items.push({
      title: item.title,
      sections: [...byType.entries()].map(([sectionType, blocks]) => ({
        sectionType,
        draftContent: blocksToJson(blocks),
      })),
    });
```

Replace with:

```tsx
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
```

---

## After applying

Typecheck with `npx tsc -p tsconfig.app.json --noEmit`, then:

1. **Re-import geriatri.** Its items should now carry their general description
   under "Indledning" rather than under "Fællesopgaver med andre specialer".
2. **View mode**: empty subsections no longer appear. A kerneopgave with nothing
   in it at all disappears; one with only an introduction still shows.
3. **Word export**: a kerneopgave with lead-in text carries it under its title,
   and any footnote inside it has the same number in Word as on screen.
4. **The editor** shows "Indledning" above the six subsections, and `Ambulant`
   between Sygehus and Fællesopgaver.

## Still worth fixing in Word, not in code

Geriatri marks none of Sygehus, Speciallægepraksis or Fremtidig varetagelse as a
heading anywhere in the document — its whole XML contains nine bold headings,
one *Almenmedicinske tilbud* and eight *Fællesopgaver*. No parser can recover a
distinction the source does not make, which is why that document averages 1.1
subsections per item against 3–5 everywhere else. Marking those headings the way
the other twelve documents do, then re-importing, is the reliable fix.
