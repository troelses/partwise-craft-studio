import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  UnderlineType,
  ExternalHyperlink,
  FootnoteReferenceRun,
  AlignmentType,
  LevelFormat,
  convertInchesToTwip,
  type ParagraphChild,
} from 'docx';
import jsPDF from 'jspdf';
import { Document as AppDocument } from '@/types/document';
import {
  ContentBlock,
  buildContentBlocks,
  blockContents,
  fetchKerneopgaver,
} from '@/utils/documentContent';
import {
  buildNumbering,
  collectFootnotes,
  parseDoc,
  noteRunsToPlainText,
  NoteRun,
  FOOTNOTE_NODE,
} from '@/utils/footnotes';

/**
 * Export a document to Word or PDF.
 *
 * Both formats walk the same ordered block list as the read view
 * (documentContent.ts), so section 2.2's kerneopgaver are included and footnote
 * numbers match what is on screen.
 *
 * Word gets real page-bottom footnotes via docx's footnote support. PDF gets
 * superscript markers plus a "Noter" list at the end — jsPDF has no text-flow
 * engine or page-region concept, so genuine page-bottom notes there would mean
 * writing a small typesetting engine.
 */

const ORDERED_LIST_REF = 'app-ordered-list';

interface TipTapNode {
  type?: string;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

/** Only schemes that are safe in a document hyperlink. Link targets can come
 *  from imported Word files, so anything else is dropped. */
const safeHref = (href: unknown): string | null => {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
};

const runStyleFromMarks = (marks: TipTapNode['marks']) => {
  const style: {
    bold?: boolean;
    italics?: boolean;
    strike?: boolean;
    underline?: { type: (typeof UnderlineType)[keyof typeof UnderlineType] };
    color?: string;
  } = {};
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') style.bold = true;
    else if (mark.type === 'italic') style.italics = true;
    else if (mark.type === 'strike') style.strike = true;
    else if (mark.type === 'underline') style.underline = { type: UnderlineType.SINGLE };
    else if (mark.type === 'textStyle') {
      const color = mark.attrs?.color;
      if (typeof color === 'string') style.color = color.replace(/^#/, '');
    }
  }
  return style;
};

const linkHrefFromMarks = (marks: TipTapNode['marks']): string | null => {
  for (const mark of marks ?? []) {
    if (mark.type === 'link') return safeHref(mark.attrs?.href);
  }
  return null;
};

/** A footnote body is inline-only, so it becomes the runs of a single Paragraph.
 *  docx prepends the footnote number itself, so the body must not repeat it. */
const noteToRuns = (note: NoteRun[] | undefined): ParagraphChild[] => {
  const children: ParagraphChild[] = [];
  for (const run of note ?? []) {
    if (!run?.t) continue;
    const style: Record<string, unknown> = { size: 18 };
    for (const mark of run.m ?? []) {
      if (mark === 'bold') style.bold = true;
      else if (mark === 'italic') style.italics = true;
      else if (mark === 'strike') style.strike = true;
      else if (mark === 'underline') style.underline = { type: UnderlineType.SINGLE };
    }
    const href = safeHref(run.href);
    if (href) {
      children.push(
        new ExternalHyperlink({
          link: href,
          children: [new TextRun({ ...style, text: run.t, style: 'Hyperlink' })],
        })
      );
    } else {
      children.push(new TextRun({ ...style, text: run.t }));
    }
  }
  return children.length > 0 ? children : [new TextRun({ text: '', size: 18 })];
};

interface WordCtx {
  /** docx footnote ids. Ids -1 and 0 are reserved by docx for the separator and
   *  continuation separator, so real footnotes start at 1. Ids come from the
   *  shared numbering map so Word matches the screen. */
  footnotes: Record<string, { children: Paragraph[] }>;
  numbering: Map<string, number>;
}

const inlineToRuns = (nodes: TipTapNode[] | undefined, ctx: WordCtx): ParagraphChild[] => {
  const children: ParagraphChild[] = [];

  for (const node of nodes ?? []) {
    if (node.type === 'text' && node.text) {
      const style = runStyleFromMarks(node.marks);
      const href = linkHrefFromMarks(node.marks);
      if (href) {
        children.push(
          new ExternalHyperlink({
            link: href,
            children: [new TextRun({ ...style, text: node.text, style: 'Hyperlink' })],
          })
        );
      } else {
        children.push(new TextRun({ ...style, text: node.text }));
      }
      continue;
    }

    if (node.type === 'hardBreak') {
      children.push(new TextRun({ break: 1 }));
      continue;
    }

    if (node.type === FOOTNOTE_NODE) {
      const fnId = node.attrs?.fnId;
      const id = typeof fnId === 'string' ? ctx.numbering.get(fnId) : undefined;
      if (!id) continue;
      const note = node.attrs?.note;
      ctx.footnotes[String(id)] = {
        children: [
          new Paragraph({
            children: noteToRuns(Array.isArray(note) ? (note as NoteRun[]) : []),
          }),
        ],
      };
      children.push(new FootnoteReferenceRun(id));
      continue;
    }

    // Any other inline wrapper: descend into it.
    if (node.content) children.push(...inlineToRuns(node.content, ctx));
  }

  return children;
};

const HEADING_BY_LEVEL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

const blockNodeToParagraphs = (
  node: TipTapNode,
  ctx: WordCtx,
  listDepth = 0,
  listKind: 'bullet' | 'ordered' | null = null
): Paragraph[] => {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).flatMap(child => blockNodeToParagraphs(child, ctx, listDepth, listKind));

    case 'paragraph': {
      const children = inlineToRuns(node.content, ctx);
      const base: Record<string, unknown> = { children, spacing: { after: 120 } };
      if (listKind === 'bullet') base.bullet = { level: listDepth };
      else if (listKind === 'ordered') {
        base.numbering = { reference: ORDERED_LIST_REF, level: listDepth };
      }
      return [new Paragraph(base as never)];
    }

    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      return [
        new Paragraph({
          children: inlineToRuns(node.content, ctx),
          heading: HEADING_BY_LEVEL[level],
          spacing: { before: 200, after: 120 },
        }),
      ];
    }

    case 'blockquote':
      // Each paragraph inside the quote becomes an indented paragraph. Do not
      // recurse through blockNodeToParagraphs here: it registers footnotes as a
      // side effect, so building and discarding paragraphs would walk them twice.
      return (node.content ?? []).map(
        child =>
          new Paragraph({
            children: inlineToRuns(child.content, ctx),
            indent: { left: convertInchesToTwip(0.5) },
            spacing: { after: 120 },
          })
      );

    case 'bulletList':
      return (node.content ?? []).flatMap(child => blockNodeToParagraphs(child, ctx, listDepth, 'bullet'));

    case 'orderedList':
      return (node.content ?? []).flatMap(child => blockNodeToParagraphs(child, ctx, listDepth, 'ordered'));

    case 'listItem':
      return (node.content ?? []).flatMap((child, i) =>
        // Nested lists step one level in; the item's own paragraphs stay put.
        child.type === 'bulletList' || child.type === 'orderedList'
          ? blockNodeToParagraphs(child, ctx, listDepth + 1, listKind)
          : blockNodeToParagraphs(child, ctx, listDepth, i === 0 ? listKind : null)
      );

    default:
      if (node.content) {
        return (node.content ?? []).flatMap(child => blockNodeToParagraphs(child, ctx, listDepth, listKind));
      }
      return [];
  }
};

const contentToParagraphs = (content: string, ctx: WordCtx): Paragraph[] => {
  const doc = parseDoc(content) as TipTapNode | null;
  if (!doc) return [];
  return blockNodeToParagraphs(doc, ctx);
};

const HEADING_FOR_DEPTH: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  0: HeadingLevel.HEADING_2,
  1: HeadingLevel.HEADING_3,
  2: HeadingLevel.HEADING_4,
};

export type ExportVariant = 'published' | 'draft';

const variantLabel = (variant: ExportVariant) =>
  variant === 'published' ? 'Godkendt version' : 'Arbejdsudkast';

const buildBlocks = async (document: AppDocument): Promise<ContentBlock[]> => {
  const kerneopgaver = await fetchKerneopgaver(document.id);
  return buildContentBlocks(document.sections, kerneopgaver);
};

export const exportToWord = async (
  document: AppDocument,
  variant: ExportVariant = 'draft'
) => {
  try {
    const blocks = await buildBlocks(document);
    const numbering = buildNumbering(blockContents(blocks));
    const ctx: WordCtx = { footnotes: {}, numbering };

    const body: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: document.title, bold: true, size: 32 })],
        heading: HeadingLevel.TITLE,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${variantLabel(variant)} · eksporteret ${new Date().toLocaleDateString('da-DK')}`,
            italics: true,
            size: 20,
            color: '666666',
          }),
        ],
        spacing: { after: 300 },
      }),
    ];

    for (const block of blocks) {
      body.push(
        new Paragraph({
          children: [new TextRun({ text: block.title, bold: true })],
          heading: HEADING_FOR_DEPTH[block.depth] ?? HeadingLevel.HEADING_4,
          spacing: { before: 240, after: 120 },
        })
      );

      if (block.kind === 'kerneopgaveTitle') continue;

      const paragraphs = contentToParagraphs(block.content, ctx);
      if (paragraphs.length > 0) {
        body.push(...paragraphs);
      } else {
        body.push(
          new Paragraph({
            children: [new TextRun({ text: 'Intet indhold.', italics: true, color: '888888' })],
            spacing: { after: 120 },
          })
        );
      }
    }

    const doc = new DocxDocument({
      // Only declared when used; an empty numbering config is still valid.
      numbering: {
        config: [
          {
            reference: ORDERED_LIST_REF,
            levels: [0, 1, 2].map(level => ({
              level,
              format: LevelFormat.DECIMAL,
              text: `%${level + 1}.`,
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.5 * (level + 1)),
                    hanging: convertInchesToTwip(0.25),
                  },
                },
              },
            })),
          },
        ],
      },
      footnotes: ctx.footnotes,
      sections: [{ properties: {}, children: body }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${document.title} (${variantLabel(variant)}).docx`;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting to Word:', error);
    throw error;
  }
};

// --- PDF ---------------------------------------------------------------------
// Superscript markers inline plus a "Noter" list at the end. jsPDF draws text
// manually with no page-region concept, so real page-bottom footnotes would mean
// measuring every note, reserving space, and reflowing the body around it.

/** Flatten a TipTap doc to plain text, replacing each footnote with its marker. */
const contentToPlainText = (content: string, numbering: Map<string, number>): string => {
  const doc = parseDoc(content) as TipTapNode | null;
  if (!doc) return '';

  const out: string[] = [];
  const walk = (node: TipTapNode) => {
    if (node.type === FOOTNOTE_NODE) {
      const fnId = node.attrs?.fnId;
      const id = typeof fnId === 'string' ? numbering.get(fnId) : undefined;
      if (id) out.push(`[${id}]`);
      return;
    }
    if (node.type === 'text' && node.text) out.push(node.text);
    for (const child of node.content ?? []) walk(child);
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') {
      out.push('\n');
    }
  };
  walk(doc);
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
};

export const exportToPDF = async (
  document: AppDocument,
  variant: ExportVariant = 'draft'
) => {
  try {
    const blocks = await buildBlocks(document);
    const contents = blockContents(blocks);
    const numbering = buildNumbering(contents);
    const entries = collectFootnotes(contents);

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let y = margin;

    const write = (text: string, size: number, style: 'normal' | 'bold' | 'italic', indent = 0) => {
      if (!text) return;
      pdf.setFont('helvetica', style);
      pdf.setFontSize(size);
      const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin - indent);
      const lineHeight = size * 0.5;
      for (const line of lines) {
        if (y + lineHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(line, margin + indent, y);
        y += lineHeight;
      }
      y += lineHeight * 0.4;
    };

    write(document.title, 20, 'bold');
    write(
      `${variantLabel(variant)} · eksporteret ${new Date().toLocaleDateString('da-DK')}`,
      10,
      'italic'
    );
    y += 4;

    for (const block of blocks) {
      const headingSize = block.depth === 0 ? 14 : block.depth === 1 ? 12 : 10;
      write(block.title, headingSize, 'bold', block.depth * 5);
      if (block.kind === 'kerneopgaveTitle') continue;
      const text = contentToPlainText(block.content, numbering);
      write(text || 'Intet indhold.', 11, text ? 'normal' : 'italic', block.depth * 5);
    }

    if (entries.length > 0) {
      y += 6;
      write('Noter', 13, 'bold');
      for (const entry of entries) {
        write(`${entry.ordinal}. ${noteRunsToPlainText(entry.note)}`, 9, 'normal', 4);
      }
    }

    pdf.save(`${document.title} (${variantLabel(variant)}).pdf`);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw error;
  }
};
