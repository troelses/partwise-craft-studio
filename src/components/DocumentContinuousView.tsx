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
  hideEmptyBlocks,
  fetchKerneopgaver,
} from '@/utils/documentContent';
import { Kerneopgave } from '@/services/kerneopgaverService';
import { DEFAULT_TEMPLATE_ID } from '@/constants/template';

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
      
      // Resolve against the document's own template, the same way the editor
      // and documentService do. This was hardcoded to the original template, so
      // any document on a different one matched no template_sections at all and
      // rendered as a page of empty headings — and, once empty blocks started
      // being hidden, as nothing whatsoever.
      const { data: documentData, error: documentError } = await supabase
        .from('documents')
        .select('template_id')
        .eq('id', document.id)
        .single();

      if (documentError) {
        throw documentError;
      }

      const templateId = documentData?.template_id || DEFAULT_TEMPLATE_ID;

      // Fetch template sections
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', templateId)
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
  // Empty sections and subsections are hidden here rather than rendered as bare
  // headings. Most documents fill only three to five of the six kerneopgave
  // subsections, and this is a read view. Numbering is unaffected: a block with
  // no content carries no footnotes.
  const blocks = hideEmptyBlocks(buildContentBlocks(
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
    kerneopgaver,
    // This view already prefers published_content for sections; kerneopgaver
    // now follow the same rule instead of always showing drafts.
    { prefer: 'published' }
  ));

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
      {cards.length === 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-2">Dokumentet har intet indhold endnu.</h2>
          <p className="text-gray-600">
            Tomme afsnit vises ikke her. Skriv indhold i redigeringsvisningen, så
            vises det.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {cards.map((card) => (
          <div key={card[0].key} className="bg-white p-6 rounded-lg shadow-sm" id={`section-${card[0].key}`}>
            {card.map((block, i) => (
              <div key={block.key} className={block.depth > 0 ? 'mt-5 pl-4 border-l-2 border-gray-200' : ''}>
                {block.depth === 0 && (
                  <h2 className="text-xl font-semibold mb-2">{block.title}</h2>
                )}
                {block.depth === 1 && (
                  <h3 className="text-lg font-semibold mb-2">{block.title}</h3>
                )}
                {block.depth === 2 && (
                  <h4 className="text-base font-medium mb-1 text-gray-700">{block.title}</h4>
                )}

                {/* A kerneopgave title has a body only when the item carries
                    lead-in text; without it the heading stands alone. */}
                {(block.kind !== 'kerneopgaveTitle' || block.content) && (
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

      <div className="bg-white p-6 rounded-lg shadow-sm mt-6">
        <FootnoteList entries={footnoteEntries} />
      </div>
    </div>
    </FootnoteNumberingContext.Provider>
  );
};

export default DocumentContinuousView;
