# Prompt 20 — line breaks are kept, and a heading before one becomes a heading

Requires prompt 19. One file: `src/utils/docxImport/ooxml.ts`. No schema change.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- If a "find this" block does not match the file exactly, stop and report it.

---

## Two defects, one cause

Section 4 separates a heading from its body with a **line break** rather than a
paragraph mark, inside a single `w:p`:

```
run bold=true   br=false  "Styrkelse af det primære sundhedsvæsen"
run bold=false  br=true   "Den kommende sundhedsreform lægger op til …"
```

**1. The break was being dropped.** A hardBreak was emitted only for a run that
holds a break *and no text*. Word normally writes the break and the text it
precedes into one run, so the break vanished. Across the 13 documents **77 of
112 line breaks were lost**, in seven documents — nothing to do with headings.

**2. The heading was not recognised.** Prompt 19's splitter only fires when the
bold lead matches one of the six kerneopgave subsection names. Section 4's
headings are free-form — *"Forskning og innovation"*, *"Uddannelse"* — so the
paragraph stayed a single run of body text with the heading glued to its front.

The fix for the first makes the second easy: once the break survives, its
presence *is* the author's signal that the bold text ends a line. The structure
is the gate, so no name matching is needed.

## What it changes

Breaks now reach the content in run order, and 56 paragraphs across three
documents split into a heading plus its body. Geriatri's section 4 becomes eight
headings each followed by its paragraph, instead of one wall of text.

The arithmetic balances: 112 breaks in total, 56 consumed by heading splits, 56
surviving as real line breaks. Both `richTextRenderer.tsx` and
`documentExporter.ts` already handle `hardBreak`, so nothing else needs touching.

Re-checked over all 13 documents: no blocks lost, footnotes in still equals
footnotes out, and the 581 kerneopgave subsection rows from prompt 19 are
unchanged — this only affects prose outside them.

## 1. Keep breaks that share a run with text

Find:

```ts
    if (el(e, 'br').length > 0 && !runText(e)) { out.push({ type: 'hardBreak' }); continue; }

    const text = runText(e);
    if (!text) continue;

    const marks: Array<{ type: string; attrs?: Record<string, unknown> }> =
      runMarks(e).map(m => ({ type: m }));
    if (linkHref) marks.push({ type: 'link', attrs: { href: linkHref } });

    out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
```

Replace with:

```ts
    const marks: Array<{ type: string; attrs?: Record<string, unknown> }> =
      runMarks(e).map(m => ({ type: m }));
    if (linkHref) marks.push({ type: 'link', attrs: { href: linkHref } });

    // Walk the run's own children in order. Word commonly writes the break and
    // the text it precedes into a single run — `<w:r><w:br/><w:t>body</w:t></w:r>`
    // — and treating the run as one unit dropped the break entirely: 77 of the
    // 112 line breaks in the real documents were lost that way.
    for (const node of Array.from(e.childNodes)) {
      const child = node as Element;
      if (child.nodeType !== 1 || child.namespaceURI !== W) continue;

      if (child.localName === 'br') { out.push({ type: 'hardBreak' }); continue; }
      if (child.localName !== 't') continue;

      const text = child.textContent ?? '';
      if (!text) continue;
      out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
    }
```

## 2. Add the splitter

Find:

```ts
const MAX_GLUED_HEADING = 45;
const MIN_GLUED_BODY = 40;
```

Replace with:

```ts
const MAX_GLUED_HEADING = 45;
const MIN_GLUED_BODY = 40;

/** A heading separated from its body by a line break rather than a paragraph
 *  mark, inside one `w:p`:
 *
 *    <w:r><w:rPr><w:b/></w:rPr><w:t>Styrkelse af det primære sundhedsvæsen</w:t></w:r>
 *    <w:r><w:br/><w:t>Den kommende sundhedsreform …</w:t></w:r>
 *
 *  56 paragraphs across three documents are written this way, and unlike the
 *  glued case below it is not confined to kerneopgave subsections — section 4
 *  uses it for headings with free-form names. The break is the author's own
 *  signal that the bold text ends a line, so the structure is the gate here and
 *  no name matching is needed. */
const MAX_BREAK_HEADING = 90;

const splitHeadingBeforeBreak = (
  content: Record<string, unknown>[]
): { heading: string; rest: Record<string, unknown>[] } | null => {
  const [lead, brk, ...rest] = content;
  if (!lead || !brk || rest.length === 0) return null;
  if (lead.type !== 'text' || brk.type !== 'hardBreak') return null;
  const marks = (lead.marks ?? []) as Array<{ type?: string }>;
  if (!marks.some(m => m?.type === 'bold')) return null;
  const heading = String(lead.text ?? '').trim();
  if (!heading || heading.length > MAX_BREAK_HEADING) return null;
  const bodyText = rest
    .map(n => (n.type === 'text' ? String(n.text ?? '') : ''))
    .join('')
    .trim();
  if (bodyText.length < MIN_GLUED_BODY) return null;
  return { heading, rest };
};
```

## 3. Try it before the name-gated rule

Find:

```ts
      const glued = splitGluedHeading(content, boldLooksLikeHeading);
```

Replace with:

```ts
      const glued =
        splitHeadingBeforeBreak(content) ?? splitGluedHeading(content, boldLooksLikeHeading);
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`, then re-import geriatri. Section 4
should show eight headings, each with its own paragraph beneath it, rather than
headings run into the text. Gastroenterologi and hæmatologi use the same
construction and will improve too; the other ten documents are unaffected except
that line breaks inside their paragraphs now survive.
