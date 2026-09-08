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
