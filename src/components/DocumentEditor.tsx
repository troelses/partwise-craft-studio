import React, { useState, useEffect } from 'react';
import { 
  PlusCircle, 
  Save, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Edit
} from 'lucide-react';
import { Document, DocumentSection } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RichTextEditor from '@/components/RichTextEditor';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { renderRichText } from '@/utils/richTextRenderer'

interface DocumentEditorProps {
  document: Document;
  onUpdate: (updatedDoc: Document) => void;
  focusSection?: string;
}

interface TemplateSection {
  id: string;
  name: string;
  position: number;
  level: number;
  description?: string;
}

interface DocumentSectionWithTemplate extends DocumentSection {
  templateSection?: TemplateSection;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({ document, onUpdate, focusSection }) => {
  const [currentDocument, setCurrentDocument] = useState<Document>(document);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [templateSections, setTemplateSections] = useState<TemplateSection[]>([]);
  const [documentSections, setDocumentSections] = useState<DocumentSectionWithTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasFocusedSection, setHasFocusedSection] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplateAndDocumentSections();
  }, [document.id]);

  // Handle focus section only once when documentSections are loaded and we haven't focused yet
  useEffect(() => {
    if (focusSection && documentSections.length > 0 && !hasFocusedSection) {
      setEditingSection(focusSection);
      setHasFocusedSection(true);
    }
  }, [focusSection, documentSections, hasFocusedSection]);

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
          return {
            id: existingSection.id,
            title: templateSection.name,
            // Use draft_content if available, otherwise fall back to content
            content: existingSection.draft_content ? JSON.stringify(existingSection.draft_content) : (existingSection.content || ''),
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
      
      // Update current document with the sections
      setCurrentDocument({
        ...currentDocument,
        sections: combinedSections
      });

    } catch (error) {
      console.error('Error fetching template and document sections:', error);
      toast({
        title: "Error",
        description: "Failed to load document template",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle title and description update
  const handleHeaderChange = (field: 'title' | 'description', value: string) => {
    setCurrentDocument({
      ...currentDocument,
      [field]: value
    });
  };

  // Save document header changes
  const saveHeaderChanges = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('documents')
        .update({ 
          title: currentDocument.title,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Document updated successfully",
      });
      setIsEditingHeader(false);
      onUpdate(currentDocument);
    } catch (error) {
      console.error('Error updating document:', error);
      toast({
        title: "Error",
        description: "Failed to update document",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle section content changes
  const handleSectionChange = (sectionId: string, field: 'title' | 'content', value: string) => {
    const updatedSections = documentSections.map(section => 
      section.id === sectionId ? { ...section, [field]: value } : section
    );
    
    setDocumentSections(updatedSections);
    setCurrentDocument({
      ...currentDocument,
      sections: updatedSections
    });
  };

  // Save section changes
  const saveSection = async (sectionId: string) => {
    setIsSaving(true);
    const section = documentSections.find(s => s.id === sectionId);
    
    if (!section || !section.templateSection) return;
    
    try {
      // Parse content as JSON for draft_content
      let draftContent;
      try {
        draftContent = typeof section.content === 'string' ? JSON.parse(section.content) : section.content;
      } catch {
        // If parsing fails, wrap plain text in a basic TipTap structure
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

      // Check if this is a new section (temp ID) or existing one
      if (section.id.startsWith('temp-')) {
        // Create new document section with draft_content
        const { data, error } = await supabase
          .from('document_sections')
          .insert({
            document_id: document.id,
            template_section_id: section.templateSection.id,
            draft_content: draftContent,
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) throw error;

        // Update the section with the real ID
        const updatedSections = documentSections.map(s => 
          s.id === sectionId ? { ...s, id: data.id } : s
        );
        setDocumentSections(updatedSections);
      } else {
        // Update existing section with draft_content
        const { error } = await supabase
          .from('document_sections')
          .update({ 
            draft_content: draftContent,
            updated_at: new Date().toISOString()
          })
          .eq('id', section.id);

        if (error) throw error;
      }

      setEditingSection(null);
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
        {isEditingHeader ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
              <Input
                id="title"
                value={currentDocument.title}
                onChange={(e) => handleHeaderChange('title', e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex space-x-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => setIsEditingHeader(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={saveHeaderChanges}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold">{currentDocument.title}</h1>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setIsEditingHeader(true)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 p-3 bg-blue-50 rounded-md">
              <p className="text-sm text-blue-700">
                This document follows the Specialebeskrivelser template. All required sections are provided below.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Document sections */}
      <div className="space-y-4">
        {sortedSections.map((section) => (
          <div key={section.id} className="document-section bg-white p-6 rounded-lg shadow-sm">
            {editingSection === section.id ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor={`section-content-${section.id}`} className="block text-sm font-medium mb-1">
                    Content for: {section.title}
                  </label>
                  {section.templateSection?.description && (
                    <p className="text-sm text-gray-600 mb-3 italic">
                      {section.templateSection.description}
                    </p>
                  )}
                  <RichTextEditor
                    content={section.content}
                    onChange={(content) => handleSectionChange(section.id, 'content', content)}
                    placeholder={`Enter content for ${section.title}...`}
                  />
                </div>
                <div className="flex space-x-2 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => setEditingSection(null)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => saveSection(section.id)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : <><Save className="h-4 w-4 mr-1" /> Save</>}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium mb-2">{section.title}</h3>
                    {section.templateSection?.description && (
                      <p className="text-sm text-gray-600 mb-3 italic">
                        {section.templateSection.description}
                      </p>
                    )}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setEditingSection(section.id)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-2">
                  {section.content ? (
                    <div className="prose max-w-none">
                      {/* Render rich text content in preview mode */}
                      {renderRichText(section.content)}
                    </div>
                  ) : (
                    <span className="text-gray-400 italic">No content - click edit to add content</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DocumentEditor;
