# Prompt 19 — the parser reads subsection headings glued to their body text

Requires prompt 18 (the `Ambulant` subsection must exist for the matcher to
recognise it). One file: `src/utils/docxImport/ooxml.ts`. No schema change.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- If a "find this" block does not match the file exactly, stop and report it.

---

## What is wrong

Three of the thirteen documents write a kerneopgave subsection heading as a
**leading bold run inside the body paragraph** rather than as a paragraph of its
own. In the XML one `w:p` reads:

```
run bold=true   "Sygehus"
run bold=false  "Fald er et uspecifikt symptom på underliggende sygdom, …"
```

Every existing rule looks at whole paragraphs, so the heading is invisible: the
paragraph is classified as ordinary body text and its subsection is never
created. The content then falls through as lead-in.

That is why two documents appeared to have almost no subsections. It is **not**
a defect in those documents — the structure is there and a reader sees it.

| document | glued headings | which |
|---|---|---|
| geriatri | 24 | Sygehus ×8, Fremtidig varetagelse ×8, Almenmedicinske tilbud ×7, Ambulant ×1 |
| gastroenterologi | 20 | Speciallægepraksis ×10, Sygehus ×10 |
| hæmatologi | 2 | Sygehus ×2 |

## What it fixes, measured over all 13 documents

| | subsection rows before | after |
|---|---|---|
| geriatri | 9 | **33** |
| gastroenterologi | 36 | **56** |
| hæmatologi | 27 | 28 |
| **all 13** | 536 | **581** |

Geriatri now yields 4–5 correctly named subsections for every one of its eight
items and no lead-in at all, where it previously averaged 1.1. No blocks are
lost anywhere and footnotes in still equals footnotes out in every document.

The split happens at the **node** level, not by cutting strings, so footnotes and
links in the body half survive untouched. It requires real body text after the
heading, so a paragraph that is only a bold heading still goes through the
existing all-bold rule instead.

## 1. Add the splitter

Find:

```ts
const listKindOf = (p: Element, styles: Map<string, string>): 'bullet' | 'ordered' | null => {
```

Replace with:

```ts
/**
 * A subsection heading written as a leading bold run inside the body paragraph,
 * rather than as a paragraph of its own — "**Sygehus**Fald er et uspecifikt
 * symptom …" as a single `w:p`.
 *
 * Three of the thirteen real documents do this, 46 headings in total, and it is
 * the reason two of them appeared to have almost no subsections: the heading is
 * invisible to every rule that looks at whole paragraphs. Splitting it restores
 * the structure the author intended and the reader sees.
 *
 * Split at the node level rather than by string surgery, so footnotes and links
 * in the body half survive untouched.
 */
const MAX_GLUED_HEADING = 45;
const MIN_GLUED_BODY = 40;

const splitGluedHeading = (
  content: Record<string, unknown>[],
  looksLikeHeading: (text: string) => boolean
): { heading: string; rest: Record<string, unknown>[] } | null => {
  const [lead, ...rest] = content;
  if (!lead || lead.type !== 'text' || rest.length === 0) return null;

  const marks = (lead.marks ?? []) as Array<{ type?: string }>;
  if (!marks.some(m => m?.type === 'bold')) return null;

  const heading = String(lead.text ?? '').trim();
  if (!heading || heading.length > MAX_GLUED_HEADING) return null;
  if (!looksLikeHeading(heading)) return null;

  // Require real body text after it, so a paragraph that is only a bold heading
  // keeps going through the existing all-bold rule instead.
  const bodyText = rest
    .map(n => (n.type === 'text' ? String(n.text ?? '') : ''))
    .join('')
    .trim();
  if (bodyText.length < MIN_GLUED_BODY) return null;

  return { heading, rest };
};

const listKindOf = (p: Element, styles: Map<string, string>): 'bullet' | 'ordered' | null => {
```

## 2. Use it in `parseBody`

Find:

```ts
    const node = level
      ? { type: 'heading', attrs: { level: Math.min(level, 6) }, content }
      : { type: 'paragraph', content };
```

Replace with:

```ts
    if (!level) {
      const glued = splitGluedHeading(content, boldLooksLikeHeading);
      if (glued) {
        blocks.push({
          level: 4,
          via: 'bold',
          text: glued.heading,
          node: { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: glued.heading }] },
          listKind: null,
        });
        const restText = text.slice(glued.heading.length).trim();
        blocks.push({
          level: null,
          via: null,
          text: restText,
          node: { type: 'paragraph', content: glued.rest },
          listKind: listKindOf(p, styles),
        });
        continue;
      }
    }

    const node = level
      ? { type: 'heading', attrs: { level: Math.min(level, 6) }, content }
      : { type: 'paragraph', content };
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`, then re-import geriatri. Every item
should show four or five named subsections, "Fald" should include **Ambulant**
between Sygehus and Fællesopgaver, and nothing should land under "Indledning".

Re-importing gastroenterologi should now produce Speciallægepraksis and Sygehus
for its items, which were missing entirely before.
