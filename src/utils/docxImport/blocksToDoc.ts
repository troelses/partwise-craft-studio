import { DocxBlock } from './types';

/**
 * Turn a run of parsed .docx blocks into one TipTap document.
 *
 * The parser deliberately produces a flat list: it records that a paragraph is
 * a list item in `listKind` rather than nesting it, because list membership is
 * only knowable once the neighbouring paragraphs are known. This is where that
 * flat list becomes the nested shape the editor and the renderer expect —
 * consecutive blocks of the same list kind collapse into a single
 * `bulletList` / `orderedList`.
 *
 * Nesting beyond level 0 is deliberately not attempted: `w:ilvl` is available
 * but the app's renderer flattens nested lists anyway, so reading it would
 * promise more fidelity than the round trip can keep.
 */

type Node = Record<string, unknown>;

const listNodeType = (kind: 'bullet' | 'ordered'): string =>
  kind === 'ordered' ? 'orderedList' : 'bulletList';

export const blocksToDoc = (blocks: DocxBlock[]): Node | null => {
  const content: Node[] = [];
  let listKind: 'bullet' | 'ordered' | null = null;
  let items: Node[] = [];

  const flush = () => {
    if (listKind && items.length > 0) {
      content.push({ type: listNodeType(listKind), content: items });
    }
    listKind = null;
    items = [];
  };

  for (const block of blocks) {
    if (block.listKind) {
      if (block.listKind !== listKind) flush();
      listKind = block.listKind;
      items.push({ type: 'listItem', content: [block.node] });
      continue;
    }
    flush();
    content.push(block.node);
  }
  flush();

  // An empty section is left unwritten rather than saved as a blank document,
  // so an import never overwrites anything with nothing.
  return content.length > 0 ? { type: 'doc', content } : null;
};

/** The same thing as a JSON string, which is the form every write path in the
 *  app takes content in. Empty string for no content. */
export const blocksToJson = (blocks: DocxBlock[]): string => {
  const doc = blocksToDoc(blocks);
  return doc ? JSON.stringify(doc) : '';
};
