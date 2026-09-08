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
