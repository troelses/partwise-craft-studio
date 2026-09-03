# Prompt 14 — .docx import, part 1: the parser

Requires prompts 9–13. This adds **no user-visible feature**: it is the parsing
layer, and it performs **no database access of any kind**. The upload dialog and
the write path follow in the next prompt, so the parser can be judged before
anything can be written.

Every rule here was derived from the 13 real draft documents, and several
contradict what the OOXML spec would lead you to expect.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- These modules must not import the Supabase client, directly or transitively.
- Where a whole file is given, create it with exactly those contents.

---

## What the documents forced

- **Heading level is usually not on the paragraph style.** In one document only 2
  of 57 subsection headings use a heading *paragraph* style; the other 55 are
  ordinary paragraphs whose runs carry the *character* style `Overskrift 4 Tegn`
  ("Heading 4 Char"), which is itself bold. Detection tries paragraph style, then
  a heading character style on every run, then bold.
- **The bold rule must be gated, but is essential.** Ungated it produced 18
  spurious subsections in one document. Gated on the text resembling one of the
  five subsection names it costs nothing — and one document marks *every*
  subsection with bold alone, so without it that document yields none.
- **Danish style ids resolve to English names**: `w:styleId="Overskrift1"` has
  `w:name="heading 1"`. Match on the resolved name.
- **Text is split across runs mid-word** — "Almenmedicinske" arrives as
  `Almenmedicinsk` + `e`. Runs are concatenated before matching.
- **Names carry typos**: `Almenmedicinsk tilbud`, `Fællesopgaver med andre
  speciale`, `Arbejdsgruppes medlemmer`, and trailing colons. Fuzzy matching
  (Sørensen–Dice over character bigrams) is required, not a nicety.
- **A kerneopgave item is any level-2 heading in that section**, not a specific
  style — one document uses three different markers for its items.
- **Subsection counts vary from 1 to 5, items from 5 to 15.** Nothing may assume
  a fixed set.
- **Headings can carry footnotes.** Three of nine footnotes in one document hang
  off a heading. Since headings are consumed as titles, those footnotes are
  lifted into the content they introduce, or they would vanish silently.
- **`Indholdsfortegnelse` is skipped** and `Opgaver i <specialty>` is a wrapper to
  descend into, not a section to match.

## 1. Add the dependency

Add to `dependencies` in `package.json`:

```json
"jszip": "^3.10.1"
```

## 2. Create `src/utils/docxImport/types.ts`

```ts
import { NoteRun } from '@/utils/footnotes';
import { KerneopgaveSectionType } from '@/constants/kerneopgaver';

/**
 * Importing a .docx specialebeskrivelse.
 *
 * The rules here were derived from the 13 real draft documents rather than from
 * the OOXML spec, because the documents diverge from what the spec would lead
 * you to expect. See docs and the parser comments for the specifics.
 */

/** One paragraph lifted out of word/document.xml, before any structuring. */
export interface DocxBlockBase {
  /** Heading level 1–6, or null for body text. */
  level: number | null;
  /** How the level was determined — useful in the review screen. */
  via: 'pStyle' | 'rStyle' | 'bold' | null;
  /** Plain text of the whole paragraph, runs already concatenated. */
  text: string;
  /** TipTap block node for this paragraph, footnotes and links included. */
  node: Record<string, unknown>;
  /** True for list items, so consecutive ones can be grouped into a list. */
  listKind: 'bullet' | 'ordered' | null;
}

export type DocxBlock = DocxBlockBase;

/** A footnote as it came out of word/footnotes.xml. */
export interface DocxFootnote {
  /** The w:id from the document; ids <= 0 are separators and are dropped. */
  wordId: number;
  note: NoteRun[];
}

export interface ParsedDocx {
  blocks: DocxBlock[];
  footnotes: Map<number, NoteRun[]>;
  warnings: string[];
}

/** One of the five fixed subsections of a kerneopgave. */
export interface ParsedKerneopgaveSection {
  type: KerneopgaveSectionType;
  /** The heading exactly as it appeared, so the review screen can show a typo. */
  sourceHeading: string;
  /** Similarity of sourceHeading to the canonical name, 0–1. */
  confidence: number;
  blocks: DocxBlock[];
}

export interface ParsedKerneopgave {
  title: string;
  sections: ParsedKerneopgaveSection[];
  /** Content before the first recognised subsection heading. */
  leadIn: DocxBlock[];
  warnings: string[];
}

/** A run of document content matched to one section of the chosen template. */
export interface ParsedSection {
  /** template_sections.id, or null when nothing matched. */
  templateSectionId: string | null;
  templateSectionName: string | null;
  sourceHeading: string;
  confidence: number;
  blocks: DocxBlock[];
  /** Only populated for the section whose section_key is 'kerneopgaver'. */
  kerneopgaver: ParsedKerneopgave[];
}

export interface ImportPreview {
  sections: ParsedSection[];
  /** Content that matched no template section — shown, never silently dropped. */
  unassigned: { sourceHeading: string; blocks: DocxBlock[] }[];
  footnoteCount: number;
  warnings: string[];
}
```

## 3. Create `src/utils/docxImport/ooxml.ts`

```ts
import { NoteRun, NoteMark, newFnId, FOOTNOTE_NODE } from '@/utils/footnotes';
import { DocxBlock } from './types';

export const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const el = (parent: Element | Document, name: string): Element[] =>
  Array.from(parent.getElementsByTagNameNS(W, name));
const firstChild = (parent: Element, name: string): Element | null => {
  for (const c of Array.from(parent.childNodes)) {
    const e = c as Element;
    if (e.nodeType === 1 && e.namespaceURI === W && e.localName === name) return e;
  }
  return null;
};
const attr = (e: Element | null, name: string): string | null =>
  e ? e.getAttributeNS(W, name) ?? e.getAttribute(`w:${name}`) : null;

/** styleId -> the human-readable w:name. Danish documents use Danish style ids
 *  (`Overskrift1`) whose w:name is the English `heading 1`, while genuinely
 *  custom styles keep Danish names — so always match on the resolved name. */
export const buildStyleMap = (stylesDoc: Document): Map<string, string> => {
  const map = new Map<string, string>();
  for (const s of el(stylesDoc, 'style')) {
    const id = attr(s, 'styleId');
    const name = attr(firstChild(s, 'name'), 'val');
    if (id && name) map.set(id, name);
  }
  return map;
};

const HEADING = /^(heading|overskrift)\s*(\d)/i;
const headingLevel = (styleName: string | undefined): number | null => {
  const m = HEADING.exec((styleName ?? '').trim());
  return m ? Number(m[2]) : null;
};

const runText = (run: Element): string =>
  el(run, 't').map(t => t.textContent ?? '').join('');

/** True when every non-empty run in the paragraph is bold. */
const allRunsBold = (runs: Element[]): boolean => {
  if (runs.length === 0) return false;
  return runs.every(r => {
    const rPr = firstChild(r, 'rPr');
    if (!rPr) return false;
    const b = firstChild(rPr, 'b');
    return !!b && attr(b, 'val') !== '0' && attr(b, 'val') !== 'false';
  });
};

/**
 * Decide whether a paragraph is a heading, and at what level.
 *
 * Order matters, and the second rule is the one the real documents depend on:
 * only a small minority of subsection headings use a heading *paragraph* style.
 * Most are ordinary paragraphs whose runs carry a heading *character* style
 * (`Overskrift 4 Tegn` = "Heading 4 Char"), which is itself bold — which is why
 * they look like headings in Word.
 *
 * The bold fallback is last and is gated by the caller (`boldLooksLikeHeading`),
 * because ungated it turns any emphasised sentence into a heading.
 */
export const classifyParagraph = (
  p: Element,
  styles: Map<string, string>,
  boldLooksLikeHeading: (text: string) => boolean
): { level: number | null; via: 'pStyle' | 'rStyle' | 'bold' | null; text: string } => {
  const text = el(p, 't').map(t => t.textContent ?? '').join('').trim();

  const pPr = firstChild(p, 'pPr');
  const pStyleId = attr(pPr ? firstChild(pPr, 'pStyle') : null, 'val');
  const fromPStyle = headingLevel(pStyleId ? styles.get(pStyleId) : undefined);
  if (fromPStyle) return { level: fromPStyle, via: 'pStyle', text };

  const runs = Array.from(p.childNodes)
    .filter(n => (n as Element).nodeType === 1 && (n as Element).localName === 'r')
    .map(n => n as Element)
    .filter(r => runText(r).trim() !== '');

  if (runs.length > 0) {
    const levels = runs.map(r => {
      const rPr = firstChild(r, 'rPr');
      const id = attr(rPr ? firstChild(rPr, 'rStyle') : null, 'val');
      return headingLevel(id ? styles.get(id) : undefined);
    });
    if (levels.every(l => l !== null) && new Set(levels).size === 1) {
      return { level: levels[0], via: 'rStyle', text };
    }
    if (allRunsBold(runs) && text.length < 120 && boldLooksLikeHeading(text)) {
      return { level: 4, via: 'bold', text };
    }
  }

  return { level: null, via: null, text };
};

const MARKS: Array<[string, NoteMark]> = [
  ['b', 'bold'], ['i', 'italic'], ['u', 'underline'], ['strike', 'strike'],
];

const runMarks = (run: Element): NoteMark[] => {
  const rPr = firstChild(run, 'rPr');
  if (!rPr) return [];
  const out: NoteMark[] = [];
  for (const [tag, mark] of MARKS) {
    const e = firstChild(rPr, tag);
    if (e && attr(e, 'val') !== '0' && attr(e, 'val') !== 'false') out.push(mark);
  }
  return out;
};

/** Footnote bodies out of word/footnotes.xml.
 *  Word reserves ids <= 0 for the separator and continuation-separator
 *  pseudo-footnotes; they carry no content and must be skipped. The body's
 *  leading `w:footnoteRef` run is the auto-number, not text, and is excluded by
 *  only reading `w:t`. */
export const parseFootnotes = (footnotesDoc: Document | null): Map<number, NoteRun[]> => {
  const map = new Map<number, NoteRun[]>();
  if (!footnotesDoc) return map;

  for (const fn of el(footnotesDoc, 'footnote')) {
    const id = Number(attr(fn, 'id'));
    if (!Number.isFinite(id) || id <= 0) continue;
    const type = attr(fn, 'type');
    if (type === 'separator' || type === 'continuationSeparator') continue;

    const runs: NoteRun[] = [];
    for (const r of el(fn, 'r')) {
      const t = runText(r);
      if (!t) continue;
      const run: NoteRun = { t };
      const marks = runMarks(r);
      if (marks.length) run.m = marks;
      runs.push(run);
    }
    if (runs.length) map.set(id, runs);
  }
  return map;
};

/** relationship id -> external target, for hyperlinks. */
export const buildRelMap = (relsDoc: Document | null): Map<string, string> => {
  const map = new Map<string, string>();
  if (!relsDoc) return map;
  for (const rel of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) map.set(id, target);
  }
  return map;
};

interface InlineCtx {
  footnotes: Map<number, NoteRun[]>;
  rels: Map<string, string>;
  usedFootnotes: Set<number>;
}

/** Convert one paragraph's inline content to TipTap nodes.
 *
 *  Tracked changes: `w:ins` content is kept (it is part of the text), `w:del` is
 *  dropped — otherwise deleted text silently reappears on import. */
const inlineNodes = (p: Element, ctx: InlineCtx, linkHref?: string): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];

  for (const child of Array.from(p.childNodes)) {
    const e = child as Element;
    if (e.nodeType !== 1 || e.namespaceURI !== W) continue;

    if (e.localName === 'del') continue;
    if (e.localName === 'ins') { out.push(...inlineNodes(e, ctx, linkHref)); continue; }

    if (e.localName === 'hyperlink') {
      const relId = e.getAttributeNS(R, 'id') ?? e.getAttribute('r:id');
      const href = relId ? ctx.rels.get(relId) : undefined;
      out.push(...inlineNodes(e, ctx, href ?? linkHref));
      continue;
    }

    if (e.localName !== 'r') continue;

    const ref = el(e, 'footnoteReference')[0];
    if (ref) {
      const id = Number(attr(ref, 'id'));
      const note = ctx.footnotes.get(id);
      if (note) {
        ctx.usedFootnotes.add(id);
        out.push({ type: FOOTNOTE_NODE, attrs: { fnId: newFnId(), note } });
      }
      continue;
    }

    if (el(e, 'br').length > 0 && !runText(e)) { out.push({ type: 'hardBreak' }); continue; }

    const text = runText(e);
    if (!text) continue;

    const marks: Array<{ type: string; attrs?: Record<string, unknown> }> =
      runMarks(e).map(m => ({ type: m }));
    if (linkHref) marks.push({ type: 'link', attrs: { href: linkHref } });

    out.push(marks.length ? { type: 'text', text, marks } : { type: 'text', text });
  }

  return out;
};

const listKindOf = (p: Element, styles: Map<string, string>): 'bullet' | 'ordered' | null => {
  const pPr = firstChild(p, 'pPr');
  if (!pPr) return null;
  if (!firstChild(pPr, 'numPr')) {
    const id = attr(firstChild(pPr, 'pStyle'), 'val');
    const name = id ? styles.get(id) ?? '' : '';
    return /list bullet|opstilling|punktopstilling/i.test(name) ? 'bullet' : null;
  }
  const id = attr(firstChild(pPr, 'pStyle'), 'val');
  const name = id ? styles.get(id) ?? '' : '';
  return /number|nummer/i.test(name) ? 'ordered' : 'bullet';
};

/** Walk word/document.xml into flat blocks. Tables are flattened to paragraphs
 *  (the app has no table node) and images are dropped; both are warned about. */
export const parseBody = (
  documentDoc: Document,
  styles: Map<string, string>,
  footnotes: Map<number, NoteRun[]>,
  rels: Map<string, string>,
  boldLooksLikeHeading: (text: string) => boolean
): { blocks: DocxBlock[]; warnings: string[]; usedFootnotes: Set<number> } => {
  const ctx: InlineCtx = { footnotes, rels, usedFootnotes: new Set() };
  const blocks: DocxBlock[] = [];
  const warnings: string[] = [];

  const tables = el(documentDoc, 'tbl').length;
  const images = el(documentDoc, 'drawing').length;
  if (tables) warnings.push(`${tables} tabel(ler) blev fladet ud til afsnit — appen har ingen tabelunderstøttelse.`);
  if (images) warnings.push(`${images} billede(r) blev udeladt.`);

  for (const p of el(documentDoc, 'p')) {
    const { level, via, text } = classifyParagraph(p, styles, boldLooksLikeHeading);
    const content = inlineNodes(p, ctx);
    if (!text && content.length === 0) continue;

    const node = level
      ? { type: 'heading', attrs: { level: Math.min(level, 6) }, content }
      : { type: 'paragraph', content };

    blocks.push({ level, via, text, node, listKind: level ? null : listKindOf(p, styles) });
  }

  return { blocks, warnings, usedFootnotes: ctx.usedFootnotes };
};
```

## 4. Create `src/utils/docxImport/sectionSplitter.ts`

```ts
import {
  KERNEOPGAVE_SECTION_LABELS,
  KERNEOPGAVE_SECTION_TYPES,
  KerneopgaveSectionType,
} from '@/constants/kerneopgaver';
import { KERNEOPGAVER_SECTION_KEY } from '@/constants/template';
import { FOOTNOTE_NODE } from '@/utils/footnotes';
import {
  DocxBlock, ImportPreview, ParsedKerneopgave, ParsedKerneopgaveSection, ParsedSection,
} from './types';

/** Template sections the document is being matched against. Passed in rather
 *  than hardcoded, so a second template — or a third later — costs nothing. */
export interface TemplateSectionRef {
  id: string;
  name: string;
  position: number;
  sectionKey?: string | null;
}

const normalise = (s: string): string =>
  s.toLowerCase().replace(/[^a-zæøå0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();

const bigrams = (s: string): Set<string> => {
  const n = normalise(s);
  if (n.length < 2) return new Set([n]);
  const out = new Set<string>();
  for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2));
  return out;
};

/** Sørensen–Dice over character bigrams. Names in the real documents differ from
 *  the canonical ones by typos ("Almenmedicinsk tilbud", "Arbejdsgruppes
 *  medlemmer"), trailing colons, and wording, so exact matching is not viable. */
export const similarity = (a: string, b: string): number => {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return (2 * shared) / (A.size + B.size);
};

const leadingNumber = (s: string): string | null => {
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(s);
  return m ? m[1] : null;
};

/** Match a heading to a template section: the leading number token first, since
 *  it is unambiguous when present, then similarity on the name. */
export const matchTemplateSection = (
  heading: string,
  sections: TemplateSectionRef[]
): { section: TemplateSectionRef | null; confidence: number } => {
  const num = leadingNumber(heading);
  if (num) {
    const byNumber = sections.find(s => leadingNumber(s.name) === num);
    if (byNumber) return { section: byNumber, confidence: 1 };
  }
  let best: TemplateSectionRef | null = null;
  let bestScore = 0;
  for (const s of sections) {
    const stripped = s.name.replace(/^\s*\d+(?:\.\d+)?\.?\s*/, '');
    const score = Math.max(similarity(heading, s.name), similarity(heading, stripped));
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 0.55 ? { section: best, confidence: bestScore } : { section: null, confidence: bestScore };
};

/**
 * A heading can itself carry a footnote reference, and in the real documents
 * three of nine footnotes do. Headings are consumed as titles — a kerneopgave
 * title is a plain string, and a section title comes from the template — so a
 * footnote left on one would be silently dropped. Lift any footnote nodes off
 * the heading into a paragraph that leads the content it introduces.
 */
const footnotesFromHeading = (b: DocxBlock): DocxBlock | null => {
  const content = (b.node as { content?: Array<Record<string, unknown>> }).content ?? [];
  const notes = content.filter(n => n.type === FOOTNOTE_NODE);
  if (notes.length === 0) return null;
  return {
    level: null,
    via: null,
    text: '',
    node: { type: 'paragraph', content: notes },
    listKind: null,
  };
};

const SUBSECTION_THRESHOLD = 0.7;

export const matchKerneopgaveSection = (
  heading: string
): { type: KerneopgaveSectionType | null; confidence: number } => {
  let best: KerneopgaveSectionType | null = null;
  let bestScore = 0;
  for (const type of KERNEOPGAVE_SECTION_TYPES) {
    const score = similarity(heading, KERNEOPGAVE_SECTION_LABELS[type]);
    if (score > bestScore) { bestScore = score; best = type; }
  }
  return bestScore >= SUBSECTION_THRESHOLD ? { type: best, confidence: bestScore } : { type: null, confidence: bestScore };
};

/** Used to gate the all-bold heading fallback: a bold paragraph only counts as a
 *  heading if it reads like one of the five subsection names. Ungated, the rule
 *  turns emphasised sentences into headings — it produced 18 spurious
 *  subsections in one document. Gated, it is essential: one document marks every
 *  subsection with bold alone and would otherwise yield none. */
export const boldLooksLikeHeading = (text: string): boolean =>
  matchKerneopgaveSection(text).type !== null;

/** Split the kerneopgaver section into items and their subsections.
 *
 *  An item is any level-2 heading inside the section — not a specific style. One
 *  document uses three different markers for its items, so keying on a style
 *  finds a fraction of them. */
const splitKerneopgaver = (blocks: DocxBlock[]): ParsedKerneopgave[] => {
  const items: ParsedKerneopgave[] = [];
  let item: ParsedKerneopgave | null = null;
  let sub: ParsedKerneopgaveSection | null = null;

  for (const b of blocks) {
    if (b.level === 2) {
      item = { title: b.text, sections: [], leadIn: [], warnings: [] };
      sub = null;
      items.push(item);
      const carried = footnotesFromHeading(b);
      if (carried) item.leadIn.push(carried);
      continue;
    }

    if (item && b.level !== null && b.level >= 3) {
      const { type, confidence } = matchKerneopgaveSection(b.text);
      if (type) {
        if (item.sections.some(s => s.type === type)) {
          item.warnings.push(
            `"${b.text}" gentager et afsnit der allerede findes — mangler der en overskrift på næste kerneopgave?`
          );
        }
        sub = { type, sourceHeading: b.text, confidence, blocks: [] };
        item.sections.push(sub);
        const carried = footnotesFromHeading(b);
        if (carried) sub.blocks.push(carried);
        continue;
      }
      // A heading that matches none of the five is kept as content rather than
      // dropped: section_type permits only those five values, so it cannot
      // become its own row without a schema change.
      (sub ? sub.blocks : item.leadIn).push(b);
      continue;
    }

    if (item) (sub ? sub.blocks : item.leadIn).push(b);
  }

  for (const it of items) {
    if (it.sections.length === 0) {
      it.warnings.push('Ingen underafsnit fundet — er dette en kerneopgave eller blot en overskrift?');
    } else if (it.sections.length > KERNEOPGAVE_SECTION_TYPES.length) {
      it.warnings.push(
        `${it.sections.length} underafsnit fundet, men der er kun ${KERNEOPGAVE_SECTION_TYPES.length} — sandsynligvis mangler en overskrift på den næste kerneopgave.`
      );
    }
  }

  return items;
};

const SKIP_HEADINGS = /^indholdsfortegnelse$/i;
/** `Opgaver i <specialty>` is a level-1 wrapper whose children are the real
 *  sections, so it must be descended into rather than matched. */
const WRAPPER_HEADING = /^opgaver i\b/i;

/**
 * Split parsed blocks into template sections.
 *
 * Sections break at level-1 and level-2 headings. Everything before the first
 * matched section, and anything whose heading matches no template section, is
 * reported as unassigned rather than dropped.
 */
export const splitIntoSections = (
  blocks: DocxBlock[],
  template: TemplateSectionRef[],
  footnoteCount: number,
  warnings: string[] = []
): ImportPreview => {
  const ordered = [...template].sort((a, b) => a.position - b.position);
  const sections: ParsedSection[] = [];
  const unassigned: { sourceHeading: string; blocks: DocxBlock[] }[] = [];

  let current: ParsedSection | null = null;
  let currentUnassigned: { sourceHeading: string; blocks: DocxBlock[] } | null = null;
  let inKerneopgaver = false;

  for (const b of blocks) {
    const isBreak = b.level === 1 || b.level === 2;

    if (isBreak) {
      if (SKIP_HEADINGS.test(b.text)) { current = null; currentUnassigned = null; inKerneopgaver = false; continue; }
      if (b.level === 1 && WRAPPER_HEADING.test(b.text)) { current = null; currentUnassigned = null; inKerneopgaver = false; continue; }

      // Inside the kerneopgaver section a level-2 heading is an item, not a new
      // section — unless it matches a template section, which ends the section.
      const { section, confidence } = matchTemplateSection(b.text, ordered);
      if (inKerneopgaver && b.level === 2 && !section) {
        if (current) current.blocks.push(b);
        continue;
      }

      if (section && !sections.some(s => s.templateSectionId === section.id)) {
        current = {
          templateSectionId: section.id,
          templateSectionName: section.name,
          sourceHeading: b.text,
          confidence,
          blocks: [],
          kerneopgaver: [],
        };
        sections.push(current);
        const carried = footnotesFromHeading(b);
        if (carried) current.blocks.push(carried);
        inKerneopgaver = section.sectionKey === KERNEOPGAVER_SECTION_KEY;
        currentUnassigned = null;
      } else {
        current = null;
        inKerneopgaver = false;
        currentUnassigned = { sourceHeading: b.text, blocks: [] };
        unassigned.push(currentUnassigned);
      }
      continue;
    }

    if (current) current.blocks.push(b);
    else if (currentUnassigned) currentUnassigned.blocks.push(b);
  }

  for (const s of sections) {
    if (s.templateSectionName && ordered.find(t => t.id === s.templateSectionId)?.sectionKey === KERNEOPGAVER_SECTION_KEY) {
      s.kerneopgaver = splitKerneopgaver(s.blocks);
      // The overview is whatever precedes the first item.
      const firstItem = s.blocks.findIndex(b => b.level === 2);
      s.blocks = firstItem === -1 ? s.blocks : s.blocks.slice(0, firstItem);
    }
  }

  return { sections, unassigned, footnoteCount, warnings };
};
```

## 5. Create `src/utils/docxImport/parseDocx.ts`

```ts
import JSZip from 'jszip';
import { buildStyleMap, buildRelMap, parseBody, parseFootnotes } from './ooxml';
import { boldLooksLikeHeading, splitIntoSections, TemplateSectionRef } from './sectionSplitter';
import { ImportPreview, ParsedDocx } from './types';

/**
 * Parse a .docx entirely in the browser.
 *
 * Deliberately client-side: parsing server-side would mean uploading the file
 * first, which means a Storage bucket and new bucket policies — a security-model
 * change this work is not allowed to make. A .docx is a zip of XML, so JSZip
 * plus the platform's own DOMParser are enough.
 *
 * This module performs no database access of any kind. Nothing is written until
 * the user confirms the mapping.
 */

const parseXml = (xml: string): Document =>
  new DOMParser().parseFromString(xml, 'application/xml');

const readMaybe = async (zip: JSZip, path: string): Promise<Document | null> => {
  const file = zip.file(path);
  if (!file) return null;
  return parseXml(await file.async('string'));
};

export const parseDocxFile = async (file: File | Blob): Promise<ParsedDocx> => {
  const zip = await JSZip.loadAsync(file);

  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Filen ser ikke ud til at være et Word-dokument (word/document.xml mangler).');
  }

  const documentDoc = parseXml(await documentFile.async('string'));
  const stylesDoc = await readMaybe(zip, 'word/styles.xml');
  const footnotesDoc = await readMaybe(zip, 'word/footnotes.xml');
  const relsDoc = await readMaybe(zip, 'word/_rels/document.xml.rels');

  const styles = stylesDoc ? buildStyleMap(stylesDoc) : new Map<string, string>();
  const footnotes = parseFootnotes(footnotesDoc);
  const rels = buildRelMap(relsDoc);

  const { blocks, warnings, usedFootnotes } = parseBody(
    documentDoc, styles, footnotes, rels, boldLooksLikeHeading
  );

  const orphans = [...footnotes.keys()].filter(id => !usedFootnotes.has(id));
  if (orphans.length) {
    warnings.push(`${orphans.length} fodnote(r) i filen har ingen henvisning i teksten og blev udeladt.`);
  }

  return { blocks, footnotes, warnings };
};

/** Parse and structure in one call: what the import dialog uses. */
export const previewDocxImport = async (
  file: File | Blob,
  template: TemplateSectionRef[]
): Promise<ImportPreview> => {
  const parsed = await parseDocxFile(file);
  const footnoteCount = parsed.blocks.reduce(
    (n, b) => n + JSON.stringify(b.node).split('"footnote"').length - 1, 0
  );
  return splitIntoSections(parsed.blocks, template, footnoteCount, parsed.warnings);
};
```

---

## Verified against all 13 documents

Run as a plain node script with no browser and no database. Results:

| | |
|---|---|
| Documents matching **every** section of their template | 13 of 13 |
| Kerneopgave subsections recognised | 548 |
| Subsections matching none of the five types | **0** |
| Footnotes parsed | 70 |
| Footnotes lost between parsing and structuring | **0** |
| Content left unassigned | **0** |

Warnings appear only in the two documents with genuine source problems: Børne-
og ungdomspsykiatri (a grouping heading with no subsections, and an item that
absorbed the next one's subsections because a heading was not styled) and
hæmatologi (one item with six subsections, same cause). The parser flags these
rather than guessing where to split — restyling those headings in Word is the
reliable fix.

## After applying

Nothing changes in the UI. Confirm the build passes and that
`src/utils/docxImport/` imports no Supabase client — that is the property the
next prompt depends on.
