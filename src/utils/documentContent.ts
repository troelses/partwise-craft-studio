import { Document, DocumentSection } from '@/types/document';
import { KERNEOPGAVER_SECTION_KEY } from '@/constants/template';
import {
  Kerneopgave,
  KERNEOPGAVE_SECTION_LABELS,
  KERNEOPGAVE_SECTION_TYPES,
  kerneopgaverService,
} from '@/services/kerneopgaverService';
import { Collaboration, collaborationsService } from '@/services/collaborationsService';

/**
 * One flat, ordered view of everything a document contains.
 *
 * Section 2.2's real body does not live in `document_sections` — it lives in the
 * `kerneopgaver` / `kerneopgave_sections` tables, one item per kerneopgave with
 * five fixed subsections. Before this, only the editor knew that: the read view
 * and both exporters walked `document.sections` alone and silently omitted it.
 *
 * Everything that needs to display or export a document now builds this list
 * instead. That is what makes footnote numbering agree between the screen and
 * the exported .docx — both number the same sequence, in the same order.
 */

export type BlockKind = 'section' | 'kerneopgaveTitle' | 'kerneopgaveSection';

export interface ContentBlock {
  /** Stable key for React lists. */
  key: string;
  kind: BlockKind;
  /** Heading text. For a kerneopgave item this is its title. */
  title: string;
  /** TipTap JSON as a string, or '' when the block has no body of its own. */
  content: string;
  /** Nesting depth, so renderers and the exporter can pick a heading level:
   *  0 = template section, 1 = kerneopgave item, 2 = its five subsections. */
  depth: number;
}

/** Fetch the kerneopgaver for a document. Returns [] rather than throwing, so a
 *  failure here degrades to "2.2 looks empty" instead of breaking the export. */
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InlineNode = Record<string, any>;

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

/**
 * Flatten a document into ordered blocks, splicing the kerneopgaver in at the
 * position of the section marked `section_key = 'kerneopgaver'`.
 *
 * Pass `{ prefer: 'published' }` to get the approved text for kerneopgaver as
 * well as sections. Until migration 20260917090000 they had no published column
 * at all, so "export the approved version" silently emitted drafts for section
 * 2.2 — the largest part of the document.
 */
export const buildContentBlocks = (
  sections: DocumentSection[],
  kerneopgaver: Kerneopgave[],
  opts?: { prefer?: 'draft' | 'published' }
): ContentBlock[] => {
  // Which text a kerneopgave subsection contributes. `sections` were already
  // resolved by whoever fetched them — documentService.getDocument takes the
  // same option — so only the kerneopgaver need deciding here.
  //
  // An unapproved subsection falls back to its draft rather than vanishing,
  // matching how getDocument treats a section that was never approved.
  const preferPublished = opts?.prefer === 'published';
  const subsectionContent = (sub?: { draftContent: string; publishedContent: string }): string => {
    if (!sub) return '';
    return preferPublished ? sub.publishedContent || sub.draftContent : sub.draftContent;
  };

  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const blocks: ContentBlock[] = [];

  for (const section of ordered) {
    blocks.push({
      key: `section-${section.id}`,
      kind: 'section',
      title: section.title,
      content: section.content || '',
      depth: 0,
    });

    if (section.sectionKey !== KERNEOPGAVER_SECTION_KEY) continue;

    // The section's own content is the overview; the items follow it.
    for (const item of kerneopgaver) {
      blocks.push({
        key: `kerneopgave-${item.id}`,
        kind: 'kerneopgaveTitle',
        title: item.title,
        // The item's own text, above its subsections. Empty for most items.
        content: item.leadIn || '',
        depth: 1,
      });

      // Always emit every subsection in canonical order, so a kerneopgave reads
      // the same everywhere even if a row is missing. Use hideEmptyBlocks to
      // drop the ones with nothing in them.
      for (const type of KERNEOPGAVE_SECTION_TYPES) {
        const sub = item.sections.find(s => s.sectionType === type);
        blocks.push({
          key: `kerneopgave-${item.id}-${type}`,
          kind: 'kerneopgaveSection',
          title: KERNEOPGAVE_SECTION_LABELS[type],
          content:
            type === 'faellesopgaver'
              ? withCollaborations(subsectionContent(sub), sub?.collaborations, preferPublished)
              : subsectionContent(sub),
          depth: 2,
        });
      }
    }
  }

  return blocks;
};

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
export const blockContents = (blocks: ContentBlock[]): string[] =>
  blocks.map(block => block.content);

/** Convenience for callers that have a Document and just need the blocks. */
export const loadContentBlocks = async (
  document: Document,
  opts?: { prefer?: 'draft' | 'published' }
): Promise<ContentBlock[]> => {
  const kerneopgaver = await fetchKerneopgaver(document.id);
  return buildContentBlocks(document.sections, kerneopgaver, opts);
};
