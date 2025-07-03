
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export const useDocumentSections = (documentId: string) => {
  const [templateSections, setTemplateSections] = useState<TemplateSection[]>([]);
  const [documentSections, setDocumentSections] = useState<DocumentSectionWithTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplateAndDocumentSections = async () => {
    try {
      setIsLoading(true);
      
      // Fetch template sections with description
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
        .order('position');

      if (templateError) {
        throw templateError;
      }

      const templateSections = templateData || [];
      setTemplateSections(templateSections);

      // Fetch existing document sections
      const { data: documentSectionsData, error: docSectionsError } = await supabase
        .from('document_sections')
        .select('*')
        .eq('document_id', documentId);

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
          return {
            id: existingSection.id,
            title: templateSection.name,
            content: existingSection.draft_content ? JSON.stringify(existingSection.draft_content) : (existingSection.content || ''),
            order: templateSection.position,
            documentId: documentId,
            createdAt: existingSection.updated_at || new Date().toISOString(),
            updatedAt: existingSection.updated_at || new Date().toISOString(),
            templateSection
          };
        } else {
          return {
            id: `temp-${templateSection.id}`,
            title: templateSection.name,
            content: '',
            order: templateSection.position,
            documentId: documentId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            templateSection
          };
        }
      });

      setDocumentSections(combinedSections);
      return combinedSections;

    } catch (error) {
      console.error('Error fetching template and document sections:', error);
      toast({
        title: "Error",
        description: "Failed to load document template",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplateAndDocumentSections();
  }, [documentId]);

  return {
    templateSections,
    documentSections,
    setDocumentSections,
    isLoading,
    fetchTemplateAndDocumentSections
  };
};
