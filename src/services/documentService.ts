
import { Document, DocumentSection } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';

// Generate a simple ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

export const documentService = {
  // Get all documents
  getDocuments: async (): Promise<Document[]> => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(doc => ({
        id: doc.id,
        title: doc.title,
        description: '', // No description field in the documents table
        category: 'Specialebeskrivelser',
        specialty: 'Unknown', // This will be determined by the template
        sections: [], // Sections will be loaded separately
        createdAt: doc.created_at || '',
        updatedAt: doc.updated_at || '',
      }));
    } catch (error) {
      console.error('Error fetching documents:', error);
      throw error;
    }
  },

  // Get documents by category
  getDocumentsByCategory: async (category: string): Promise<Document[]> => {
    return this.getDocuments(); // For now, return all documents
  },

  // Get a single document
  getDocument: async (id: string): Promise<Document | undefined> => {
    try {
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (docError) throw docError;
      if (!docData) return undefined;

      // First, get the template sections to define the structure
      const { data: templateSections, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03')
        .order('position');

      if (templateError) throw templateError;

      // Then get any existing document sections
      const { data: existingSections, error: sectionsError } = await supabase
        .from('document_sections')
        .select('*')
        .eq('document_id', id);

      if (sectionsError) throw sectionsError;

      // Create a map of existing sections by template_section_id
      const existingSectionsMap = new Map();
      existingSections?.forEach(section => {
        if (section.template_section_id) {
          existingSectionsMap.set(section.template_section_id, section);
        }
      });

      // Build sections array based on template structure
      const sections: DocumentSection[] = (templateSections || []).map(templateSection => {
        const existingSection = existingSectionsMap.get(templateSection.id);
        
        return {
          id: existingSection?.id || generateId(),
          title: templateSection.name,
          content: existingSection?.content || '',
          order: templateSection.position,
          documentId: id,
          createdAt: existingSection?.updated_at || new Date().toISOString(),
          updatedAt: existingSection?.updated_at || new Date().toISOString(),
          templateSectionId: templateSection.id,
        };
      });

      return {
        id: docData.id,
        title: docData.title,
        description: '',
        category: 'Specialebeskrivelser',
        specialty: 'Unknown',
        sections,
        createdAt: docData.created_at || '',
        updatedAt: docData.updated_at || '',
      };
    } catch (error) {
      console.error('Error fetching document:', error);
      throw error;
    }
  },

  // Create a new document
  createDocument: async (document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .insert({
          title: document.title,
          template_id: '439df5fa-9aa6-4c2f-bb71-f26fa4b29f03',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error('Failed to create document');

      return {
        ...document,
        id: data.id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (error) {
      console.error('Error creating document:', error);
      throw error;
    }
  },

  // Update a document
  updateDocument: async (document: Document): Promise<Document> => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({
          title: document.title,
          updated_at: new Date().toISOString(),
        })
        .eq('id', document.id);

      if (error) throw error;

      return {
        ...document,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error updating document:', error);
      throw error;
    }
  },

  // Delete a document
  deleteDocument: async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting document:', error);
      throw error;
    }
  },

  // Add a section to a document (not used for template documents)
  addSection: async (documentId: string, section: Omit<DocumentSection, 'id' | 'documentId' | 'createdAt' | 'updatedAt'>): Promise<DocumentSection> => {
    const newSection: DocumentSection = {
      ...section,
      id: generateId(),
      documentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // This is a mock implementation for non-template documents
    return newSection;
  },

  // Update a section
  updateSection: async (section: DocumentSection): Promise<DocumentSection> => {
    try {
      // Check if this document section already exists in the database
      const { data: existingSection } = await supabase
        .from('document_sections')
        .select('id')
        .eq('document_id', section.documentId)
        .eq('template_section_id', section.templateSectionId)
        .single();

      if (existingSection) {
        // Update existing section
        const { error } = await supabase
          .from('document_sections')
          .update({
            content: section.content,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSection.id);

        if (error) throw error;
      } else {
        // Create new section
        const { error } = await supabase
          .from('document_sections')
          .insert({
            document_id: section.documentId,
            template_section_id: section.templateSectionId,
            content: section.content,
            updated_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      return {
        ...section,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error updating section:', error);
      throw error;
    }
  },

  // Delete a section (not used for template documents)
  deleteSection: async (documentId: string, sectionId: string): Promise<boolean> => {
    // This is a mock implementation for non-template documents
    return true;
  }
};
