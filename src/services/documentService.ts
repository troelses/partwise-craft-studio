import { Document, DocumentSection } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';

// Generate a simple ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

export const documentService = {
  // Get all documents
  getDocuments: async (category?: string): Promise<Document[]> => {
    try {
      let query = supabase
        .from('documents')
        .select(`
          *,
          document_sections (
            id,
            content,
            draft_content,
            published_content,
            template_section_id,
            template_sections (
              id,
              name,
              position,
              level,
              description
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (category) {
        // For now we'll filter client-side since category isn't stored in DB yet
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching documents:', error);
        throw error;
      }

      if (!data) {
        return [];
      }

      return data.map(doc => ({
        id: doc.id,
        title: doc.title,
        description: '', // Default empty description
        category: 'Specialebeskrivelser' as const, // Default category
        specialty: 'Unknown', // Default specialty
        createdAt: doc.created_at || '',
        updatedAt: doc.updated_at || '',
        sections: (doc.document_sections || []).map((section: any) => ({
          id: section.id,
          title: section.template_sections?.name || 'Untitled Section',
          // Use draft_content if available, otherwise fall back to content
          content: section.draft_content ? JSON.stringify(section.draft_content) : (section.content || ''),
          order: section.template_sections?.position || 0,
          documentId: doc.id,
          createdAt: section.created_at || doc.created_at || '',
          updatedAt: section.updated_at || doc.updated_at || '',
          templateSectionId: section.template_section_id
        }))
      }));
    } catch (error) {
      console.error('Error in getDocuments:', error);
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
      (existingSections || []).forEach(section => {
        if (section.template_section_id) {
          existingSectionsMap.set(section.template_section_id, section);
        }
      });

      // Build sections array based on template structure
      const sections: DocumentSection[] = (templateSections || []).map(templateSection => {
        const existingSection = existingSectionsMap.get(templateSection.id);
        
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
      });

      return {
        id: docData.id,
        title: docData.title,
        description: '', // Default empty description
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

  updateSection: async (section: DocumentSection): Promise<DocumentSection> => {
    try {
      // Parse content as JSON if it's a string
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

      // Check if this document section already exists in the database
      const { data: existingSection } = await supabase
        .from('document_sections')
        .select('id')
        .eq('document_id', section.documentId)
        .eq('template_section_id', section.templateSectionId || '')
        .single();

      if (existingSection) {
        // Update existing section with draft_content
        const { error } = await supabase
          .from('document_sections')
          .update({
            draft_content: draftContent,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSection.id);

        if (error) throw error;
      } else {
        // Create new section with draft_content
        const { error } = await supabase
          .from('document_sections')
          .insert({
            document_id: section.documentId,
            template_section_id: section.templateSectionId || '',
            draft_content: draftContent,
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

  deleteSection: async (documentId: string, sectionId: string): Promise<boolean> => {
    // This is a mock implementation for non-template documents
    return true;
  },

  // Check if current user is team lead for a document
  isTeamLead: async (documentId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await supabase.rpc('check_team_lead', {
        user_id: user.id,
        doc_id: documentId
      });

      if (error) {
        console.error('Error checking team lead status:', error);
        return false;
      }

      return data || false;
    } catch (error) {
      console.error('Error checking team lead status:', error);
      return false;
    }
  },

  // Get document sections with approval status for team lead review
  getDocumentSectionsForApproval: async (documentId: string) => {
    try {
      const { data, error } = await supabase
        .from('document_sections')
        .select(`
          *,
          template_sections (
            id,
            name,
            position,
            description
          )
        `)
        .eq('document_id', documentId)
        .order('template_sections(position)');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching sections for approval:', error);
      throw error;
    }
  },

  // Approve a section by moving draft_content to published_content
  approveSection: async (sectionId: string): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Get the current section to access draft_content
      const { data: section, error: fetchError } = await supabase
        .from('document_sections')
        .select('draft_content')
        .eq('id', sectionId)
        .single();

      if (fetchError || !section) throw fetchError;

      // Move draft_content to published_content and mark as approved
      const { error } = await supabase
        .from('document_sections')
        .update({
          published_content: section.draft_content,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          is_approved: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', sectionId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error approving section:', error);
      return false;
    }
  }
};
