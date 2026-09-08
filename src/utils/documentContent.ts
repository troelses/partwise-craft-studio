import { Document, DocumentSection } from '@/types/document';
import { KERNEOPGAVER_SECTION_KEY } from '@/constants/template';
import {
  Kerneopgave,
  KERNEOPGAVE_SECTION_LABELS,
  KERNEOPGAVE_SECTION_TYPES,
  kerneopgaverService,
} from '@/services/kerneopgaverService';

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
    return await kerneopgaverService.getKerneopgaver(documentId);
  } catch (error) {
    console.error('Error loading kerneopgaver for document content:', error);
    return [];
  }
};

/**
 * Flatten a document into ordered blocks, splicing the kerneopgaver in at the
 * position of the section marked `section_key = 'kerneopgaver'`.
 *
 * `kerneopgave_sections` has no `published_content` column, so kerneopgaver are
 * always their draft text regardless of which export variant asked for them.
 */
export const buildContentBlocks = (
  sections: DocumentSection[],
  kerneopgaver: Kerneopgave[]
): ContentBlock[] => {
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
        content: '',
        depth: 1,
      });

      // Always emit the five subsections in their canonical order, so a
      // kerneopgave reads the same everywhere even if a row is missing.
      for (const type of KERNEOPGAVE_SECTION_TYPES) {
        const sub = item.sections.find(s => s.sectionType === type);
        blocks.push({
          key: `kerneopgave-${item.id}-${type}`,
          kind: 'kerneopgaveSection',
          title: KERNEOPGAVE_SECTION_LABELS[type],
          content: sub?.draftContent || '',
          depth: 2,
        });
      }
    }
  }

  return blocks;
};

/** The content strings in document order — the input to footnote numbering. */
export const blockContents = (blocks: ContentBlock[]): string[] =>
  blocks.map(block => block.content);

/** Convenience for callers that have a Document and just need the blocks. */
export const loadContentBlocks = async (document: Document): Promise<ContentBlock[]> => {
  const kerneopgaver = await fetchKerneopgaver(document.id);
  return buildContentBlocks(document.sections, kerneopgaver);
};
