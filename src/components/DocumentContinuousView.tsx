
import React, { useState, useEffect } from 'react';
import { Document } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';
import { renderRichText } from '@/utils/richTextRenderer';

interface DocumentContinuousViewProps {
  document: Document;
}

interface TemplateSection {
  id: string;
  name: string;
  position: number;
  level: number;
  description?: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDocumentSections();
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

  const handleEditSection = (sectionId: string) => {
    // Store current scroll position before navigating
    const currentScrollY = window.scrollY;
    sessionStorage.setItem(`scroll-position-${document.id}`, currentScrollY.toString());
    
    // Navigate to edit mode with section focus
    navigate(`/documents/${document.id}`, { 
      state: { 
        viewMode: 'edit',
        focusSection: sectionId,
        preserveScroll: true
      } 
    });
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

  return (
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
        {sortedSections.map((section) => (
          <div key={section.id} className="bg-white p-6 rounded-lg shadow-sm" id={`section-${section.id}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-semibold mb-2">{section.title}</h2>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEditSection(section.id)}
                className="flex items-center ml-4"
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </div>
            
            <div className="prose max-w-none">
              {section.content ? (
                renderRichText(section.content)
              ) : (
                <p className="text-gray-400 italic">No content available for this section.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentContinuousView;
