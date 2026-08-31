
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_TEMPLATE_ID } from '@/constants/template';

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

export const useDocumentSections = (documentId: string) => {
  const [templateSections, setTemplateSections] = useState<TemplateSection[]>([]);
  const [documentSections, setDocumentSections] = useState<DocumentSectionWithTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplateAndDocumentSections = async () => {
    try {
      setIsLoading(true);

      // Resolve the template from the document itself, so documents created with
      // an older template keep rendering their original section structure.
      const { data: documentData, error: documentError } = await supabase
        .from('documents')
        .select('template_id')
        .eq('id', documentId)
        .single();

      if (documentError) {
        throw documentError;
      }

      const templateId = documentData?.template_id || DEFAULT_TEMPLATE_ID;

      // Fetch template sections with description
      const { data: templateData, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', templateId)
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
            templateSection: {
              id: templateSection.id,
              name: templateSection.name,
              position: templateSection.position,
              level: templateSection.level,
              description: templateSection.description,
              section_key: templateSection.section_key ?? null,
            }
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
            templateSection: {
              id: templateSection.id,
              name: templateSection.name,
              position: templateSection.position,
              level: templateSection.level,
              description: templateSection.description,
              section_key: templateSection.section_key ?? null,
            }
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
