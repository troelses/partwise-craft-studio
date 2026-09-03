# Prompt 11 — Export: kerneopgaver, real Word footnotes, two variants

Requires prompts 9 and 10.

Three things change here.

**Kerneopgaver reach the read view and the export.** `KerneopgaverSection` is
rendered only from the editor, so section 2.2's real body — the per-kerneopgave
items and their five fixed subsections — was invisible in the read view and
absent from every export. A footnote there would have been numbered on screen and
missing from Word, so this had to be fixed for continuous numbering to mean
anything.

**Word gets real page-bottom footnotes.** Verified by generating a .docx and
reading its XML: `word/footnotes.xml` carries the notes, ids start at 1 (docx
reserves -1 and 0 for the separators), and hyperlinks inside notes resolve
through `word/_rels/footnotes.xml.rels`.

**Export offers both versions.** Until now the Export button downloaded the
working draft while the View tab showed approved text — the same screen
disagreeing with itself. The menu now names which one you are getting.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- Do not touch the MCP integration, `query-documents`, or `document_access` logic.
- Where a whole file is given, replace the file's entire contents with exactly what is shown.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.

---

## 1. `src/types/document.ts`

Find:

```ts
  updatedAt: string;
  templateSectionId?: string;
}
```

Replace with:

```ts
  updatedAt: string;
  templateSectionId?: string;
  /** template_sections.section_key — identifies sections needing special
   *  handling, currently only 'kerneopgaver'. */
  sectionKey?: string | null;
}
```

## 2. `src/services/documentService.ts`

**a.** Find:

```ts
  getDocument: async (id: string): Promise<Document | undefined> => {
```

Replace with:

```ts
  // `prefer` selects which stored content a section reports. Defaults to
  // 'draft', which is what every existing caller expects; the export menu asks
  // for 'published' when exporting the approved version.
  getDocument: async (
    id: string,
    opts?: { prefer?: 'draft' | 'published' }
  ): Promise<Document | undefined> => {
    const prefer = opts?.prefer ?? 'draft';
```

**b.** Find:

```ts
        return {
          id: existingSection?.id || generateId(),
          title: templateSection.name || '',
          // Use draft_content if available, otherwise fall back to content
          content: existingSection?.draft_content ? JSON.stringify(existingSection.draft_content) : (existingSection?.content || ''),
          order: templateSection.position || 0,
          documentId: id,
          createdAt: existingSection?.created_at || new Date().toISOString(),
          updatedAt: existingSection?.updated_at || new Date().toISOString(),
          templateSectionId: templateSection.id,
        };
```

Replace with:

```ts
        // With prefer='published' an unapproved section falls back to its draft,
        // so an export is never silently missing a section that was never
        // approved. With prefer='draft' the newest text always wins.
        const published = existingSection?.published_content
          ? JSON.stringify(existingSection.published_content)
          : '';
        const draft = existingSection?.draft_content
          ? JSON.stringify(existingSection.draft_content)
          : '';
        const legacy = existingSection?.content || '';
        const content =
          prefer === 'published'
            ? (published || draft || legacy)
            : (draft || legacy);

        return {
          id: existingSection?.id || generateId(),
          title: templateSection.name || '',
          content,
          order: templateSection.position || 0,
          documentId: id,
          createdAt: existingSection?.created_at || new Date().toISOString(),
          updatedAt: existingSection?.updated_at || new Date().toISOString(),
          templateSectionId: templateSection.id,
          sectionKey: (templateSection as { section_key?: string | null }).section_key ?? null,
        };
```

## 3. Create `src/utils/documentContent.ts`

The single ordered list of everything a document contains. The read view and both
exporters all build it, which is what makes the footnote numbers agree.

```ts
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
```

## 4. Replace `src/components/DocumentContinuousView.tsx`

Replace the **whole file**.

```tsx
import React, { useState, useEffect } from 'react';
import { Document } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';
import {
  renderRichText,
  FootnoteNumberingContext,
  FootnoteList,
} from '@/utils/richTextRenderer';
import { collectFootnotes, buildNumbering } from '@/utils/footnotes';
import {
  ContentBlock,
  buildContentBlocks,
  blockContents,
  fetchKerneopgaver,
} from '@/utils/documentContent';
import { Kerneopgave } from '@/services/kerneopgaverService';

interface DocumentContinuousViewProps {
  document: Document;
}

interface TemplateSection {
  id: string;
  name: string;
  position: number;
  level: number;
  description?: string;
  section_key?: string | null;
}

interface DocumentSectionWithTemplate {
  id: string;
  title: string;
  content: string;
  order: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  templateSection?: TemplateSection;
}

const DocumentContinuousView: React.FC<DocumentContinuousViewProps> = ({ document }) => {
  const [documentSections, setDocumentSections] = useState<DocumentSectionWithTemplate[]>([]);
  const [kerneopgaver, setKerneopgaver] = useState<Kerneopgave[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDocumentSections();
    // Section 2.2's body lives in its own tables, not in document_sections.
    fetchKerneopgaver(document.id).then(setKerneopgaver);
  }, [document.id]);

  const fetchDocumentSections = async () => {
    try {
      setIsLoading(true);
      
      // Fetch template sections
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
        .order('position');

      if (templateError) {
        throw templateError;
      }

      const templateSections = templateData || [];

      // Fetch existing document sections
      const { data: documentSectionsData, error: docSectionsError } = await supabase
        .from('document_sections')
        .select('*')
        .eq('document_id', document.id);

      if (docSectionsError) {
        throw docSectionsError;
      }

      // Create a map of existing document sections by template_section_id
      const existingSectionsMap = new Map();
      (documentSectionsData || []).forEach(section => {
        if (section.template_section_id) {
          existingSectionsMap.set(section.template_section_id, section);
        }
      });

      // Combine template sections with document sections
      const combinedSections: DocumentSectionWithTemplate[] = templateSections.map(templateSection => {
        const existingSection = existingSectionsMap.get(templateSection.id);
        
        if (existingSection) {
          // Use published_content if available, otherwise fall back to draft_content or content
          const content = existingSection.published_content 
            ? JSON.stringify(existingSection.published_content)
            : (existingSection.draft_content 
              ? JSON.stringify(existingSection.draft_content) 
              : (existingSection.content || ''));

          return {
            id: existingSection.id,
            title: templateSection.name,
            content,
            order: templateSection.position,
            documentId: document.id,
            createdAt: existingSection.updated_at || new Date().toISOString(),
            updatedAt: existingSection.updated_at || new Date().toISOString(),
            templateSection
          };
        } else {
          // Create placeholder for missing sections
          return {
            id: `temp-${templateSection.id}`,
            title: templateSection.name,
            content: '',
            order: templateSection.position,
            documentId: document.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            templateSection
          };
        }
      });

      setDocumentSections(combinedSections);
    } catch (error) {
      console.error('Error fetching document sections:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded w-1/3"></div>
        <div className="h-6 bg-gray-200 rounded w-1/2"></div>
        <div className="h-36 bg-gray-200 rounded w-full mt-6"></div>
        <div className="h-36 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  const sortedSections = [...documentSections].sort((a, b) => a.order - b.order);

  // One ordered list of everything the document contains, with the kerneopgaver
  // spliced in at section 2.2. The exporters build the same list from the same
  // helper, which is what makes footnote numbers match between screen and Word.
  const blocks = buildContentBlocks(
    sortedSections.map(section => ({
      id: section.id,
      title: section.title,
      content: section.content,
      order: section.order,
      documentId: section.documentId,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      templateSectionId: section.templateSection?.id,
      sectionKey: section.templateSection?.section_key ?? null,
    })),
    kerneopgaver
  );

  // Footnote numbering runs continuously across the whole document, so it is
  // computed here — above the render loop — and supplied to every renderer
  // through context. Nothing is persisted: inserting a footnote in an early
  // section renumbers the later ones on the next render without touching their
  // stored content.
  const orderedContents = blockContents(blocks);
  const footnoteEntries = collectFootnotes(orderedContents);
  const footnoteNumbering = buildNumbering(orderedContents);

  // A new card starts at each template section; kerneopgave blocks belong to the
  // card of the section they were spliced into.
  const cards: ContentBlock[][] = [];
  for (const block of blocks) {
    if (block.kind === 'section' || cards.length === 0) cards.push([block]);
    else cards[cards.length - 1].push(block);
  }

  return (
    <FootnoteNumberingContext.Provider value={footnoteNumbering}>
    <div className="max-w-4xl mx-auto">
      {/* Document header */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        <h1 className="text-3xl font-bold mb-4">{document.title}</h1>
        <div className="p-3 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-700">
            This document follows the Specialebeskrivelser template structure.
          </p>
        </div>
      </div>

      {/* Document sections */}
      <div className="space-y-6">
        {cards.map((card) => (
          <div key={card[0].key} className="bg-white p-6 rounded-lg shadow-sm" id={card[0].key}>
            {card.map((block, i) => (
              <div key={block.key} className={block.depth > 0 ? 'mt-5 pl-4 border-l-2 border-gray-200' : ''}>
                {block.depth === 0 && (
                  <h2 className="text-xl font-semibold mb-4">{block.title}</h2>
                )}
                {block.depth === 1 && (
                  <h3 className="text-lg font-semibold mb-2">{block.title}</h3>
                )}
                {block.depth === 2 && (
                  <h4 className="text-sm font-semibold text-gray-600 mb-1">{block.title}</h4>
                )}

                {block.kind !== 'kerneopgaveTitle' && (
                  <div className="prose max-w-none">
                    {block.content ? (
                      renderRichText(block.content)
                    ) : (
                      <p className="text-gray-400 italic">
                        {block.depth === 0
                          ? 'No content available for this section.'
                          : 'Intet indhold.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="bg-white px-6 pb-6 rounded-lg shadow-sm mt-6">
        <FootnoteList entries={footnoteEntries} />
      </div>
    </div>
    </FootnoteNumberingContext.Provider>
  );
};

export default DocumentContinuousView;
```

## 5. Replace `src/utils/documentExporter.ts`

Replace the **whole file**. This is a rewrite: the old version flattened
everything to plain text and emitted one `TextRun` per section.

```ts
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
```

## 6. `src/pages/DocumentView.tsx`

**a.** Find:

```ts
import { exportToWord, exportToPDF } from '@/utils/documentExporter';
```

Replace with:

```ts
import { exportToWord, exportToPDF, type ExportVariant } from '@/utils/documentExporter';
```

**b.** Find:

```ts
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
```

Replace with:

```ts
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
```

**c.** Find the export handler:

```ts
  const handleExport = async (format: 'word' | 'pdf') => {
    if (!document) return;
    
    try {
      if (format === 'word') {
        await exportToWord(document);
        toast({
          title: "Success",
          description: "Document exported as Word document",
        });
      } else {
        await exportToPDF(document);
        toast({
          title: "Success",
          description: "Document exported as PDF",
        });
      }
    } catch (error) {
```

Replace with:

```ts
  const handleExport = async (format: 'word' | 'pdf', variant: ExportVariant) => {
    if (!document || !id) return;

    try {
      // The document held in state is always the draft, because that is what the
      // editor works on. Exporting the approved version therefore needs its own
      // fetch; sections that were never approved fall back to their draft.
      const target =
        variant === 'published'
          ? (await documentService.getDocument(id, { prefer: 'published' })) ?? document
          : document;

      const label = variant === 'published' ? 'godkendt version' : 'arbejdsudkast';

      if (format === 'word') {
        await exportToWord(target, variant);
        toast({
          title: "Success",
          description: `Dokumentet blev eksporteret som Word (${label})`,
        });
      } else {
        await exportToPDF(target, variant);
        toast({
          title: "Success",
          description: `Dokumentet blev eksporteret som PDF (${label})`,
        });
      }
    } catch (error) {
```

**d.** Find the export menu:

```tsx
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleExport('word')}>
                      Export as Word
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('pdf')}>
                      Export as PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
```

Replace with:

```tsx
                  <DropdownMenuContent className="w-64">
                    <DropdownMenuLabel>Godkendt version</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => handleExport('word', 'published')}>
                      Word
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('pdf', 'published')}>
                      PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Arbejdsudkast</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => handleExport('word', 'draft')}>
                      Word
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('pdf', 'draft')}>
                      PDF
                    </DropdownMenuItem>
                    <p className="px-2 py-1.5 text-xs text-gray-500">
                      Kerneopgaver har ingen godkendt version og eksporteres altid
                      som udkast.
                    </p>
                  </DropdownMenuContent>
```

---

## After applying

- Export to Word and open it: section 2.2 should contain the kerneopgaver with
  their five subsections, and footnotes should sit at the page bottom, numbered
  continuously — including any inside a kerneopgave.
- Approve a section, edit it without approving, then compare the two export
  variants: *Godkendt version* shows the approved text, *Arbejdsudkast* the edit.
- `kerneopgave_sections` has only `draft_content`, so kerneopgaver are always
  draft text under either variant. The menu says so.
