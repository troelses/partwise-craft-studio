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
