
import { useState } from 'react';
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

export const useSectionEditor = (
  documentId: string,
  documentSections: DocumentSectionWithTemplate[],
  setDocumentSections: (sections: DocumentSectionWithTemplate[]) => void
) => {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [originalSectionContent, setOriginalSectionContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const startEditingSection = (sectionId: string) => {
    const section = documentSections.find(s => s.id === sectionId);
    if (section) {
      setOriginalSectionContent(section.content);
      setEditingSection(sectionId);
    }
  };

  const cancelEditingSection = () => {
    if (editingSection && originalSectionContent !== undefined) {
      const updatedSections = documentSections.map(section => 
        section.id === editingSection ? { ...section, content: originalSectionContent } : section
      );
      setDocumentSections(updatedSections);
    }
    
    setEditingSection(null);
    setOriginalSectionContent('');
  };

  const handleSectionChange = (sectionId: string, content: string) => {
    const updatedSections = documentSections.map(section => 
      section.id === sectionId ? { ...section, content } : section
    );
    setDocumentSections(updatedSections);
  };

  const saveSection = async (sectionId: string) => {
    setIsSaving(true);
    const section = documentSections.find(s => s.id === sectionId);
    
    if (!section || !section.templateSection) return;
    
    try {
      let draftContent;
      try {
        draftContent = typeof section.content === 'string' ? JSON.parse(section.content) : section.content;
      } catch {
        draftContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: section.content
                }
              ]
            }
          ]
        };
      }

      if (section.id.startsWith('temp-')) {
        const { data, error } = await supabase
          .from('document_sections')
          .insert({
            document_id: documentId,
            template_section_id: section.templateSection.id,
            draft_content: draftContent,
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        const updatedSections = documentSections.map(s => 
          s.id === sectionId ? { ...s, id: data.id } : s
        );
        setDocumentSections(updatedSections);
      } else {
        const { error } = await supabase
          .from('document_sections')
          .update({ 
            draft_content: draftContent,
            is_approved: false,
            approved_by: null,
            approved_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', section.id);

        if (error) throw error;
      }

      setEditingSection(null);
      setOriginalSectionContent('');
      toast({
        title: "Success",
        description: "Section draft saved successfully",
      });
    } catch (error) {
      console.error('Error updating section:', error);
      toast({
        title: "Error",
        description: "Failed to save section draft",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    editingSection,
    setEditingSection,
    isSaving,
    startEditingSection,
    cancelEditingSection,
    handleSectionChange,
    saveSection
  };
};
