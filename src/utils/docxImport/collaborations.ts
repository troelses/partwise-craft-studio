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
