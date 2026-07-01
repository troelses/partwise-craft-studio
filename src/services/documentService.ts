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
    return documentService.getDocuments(); // For now, return all documents
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

      // Build sections array based on template structure - handle null/undefined templateSections
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
        .maybeSingle();

      if (existingSection) {
        // Update existing section with draft_content
        const { error } = await supabase
          .from('document_sections')
          .update({
            draft_content: draftContent,
            is_approved: false,
            approved_by: null,
            approved_at: null,
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
  // Returns the current user's permission level on a document, or null.
  // Admins are treated as 'approve' (highest) on every document.
  getMyPermission: async (
    documentId: string
  ): Promise<'view' | 'write' | 'approve' | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (profile?.role === 'admin') return 'approve';

      const { data, error } = await supabase
        .from('document_access')
        .select('permission')
        .eq('document_id', documentId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Error fetching permission:', error);
        return null;
      }
      return (data?.permission as 'view' | 'write' | 'approve' | undefined) ?? null;
    } catch (error) {
      console.error('Error fetching permission:', error);
      return null;
    }
  },

  // Kept as a wrapper so existing call sites work until Stage 3.
  isTeamLead: async (documentId: string): Promise<boolean> => {
    return (await documentService.getMyPermission(documentId)) === 'approve';
  },

  // List everyone with access to a document (with emails) — for the Stage 4 UI.
  getDocumentAccess: async (documentId: string) => {
    try {
      const { data: grants, error } = await supabase
        .from('document_access')
        .select('user_id, permission, created_at')
        .eq('document_id', documentId);
      if (error) throw error;

      const userIds = (grants ?? []).map(g => g.user_id);
      let profiles: { user_id: string; email: string }[] = [];
      if (userIds.length) {
        const { data } = await supabase
          .from('user_profiles')
          .select('user_id, email')
          .in('user_id', userIds);
        profiles = data ?? [];
      }
      const emailMap = new Map(profiles.map(p => [p.user_id, p.email]));
      return (grants ?? []).map(g => ({ ...g, email: emailMap.get(g.user_id) ?? null }));
    } catch (error) {
      console.error('Error fetching document access:', error);
      return [];
    }
  },

  // Grant or change a user's access level (RLS enforces who may do this;
  // only admins may grant 'approve').
  grantAccess: async (
    documentId: string,
    userId: string,
    permission: 'view' | 'write' | 'approve'
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('document_access')
        .upsert(
          {
            document_id: documentId,
            user_id: userId,
            permission,
            granted_by: user?.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'document_id,user_id' }
        );
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error granting access:', error);
      return false;
    }
  },

  revokeAccess: async (documentId: string, userId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('document_access')
        .delete()
        .eq('document_id', documentId)
        .eq('user_id', userId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error revoking access:', error);
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
        .maybeSingle();

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
  },

  // Assign team lead to document
  assignTeamLead: async (documentId: string, userId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ team_lead_id: userId })
        .eq('id', documentId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error assigning team lead:', error);
      return false;
    }
  },

  // Get all documents for admin management
  getAllDocumentsForAdmin: async () => {
    try {
      // First get all documents
      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      if (!documents) {
        return [];
      }

      // Then get user profiles for team leads
      const teamLeadIds = documents
        .map(doc => doc.team_lead_id)
        .filter(id => id !== null);

      let userProfiles: any[] = [];
      if (teamLeadIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('user_id, email')
          .in('user_id', teamLeadIds);

        if (profilesError) throw profilesError;
        userProfiles = profiles || [];
      }

      // Create a map of user profiles by user_id
      const profilesMap = new Map();
      userProfiles.forEach(profile => {
        profilesMap.set(profile.user_id, profile);
      });

      // Transform the data to match the expected interface
      return documents.map(doc => ({
        ...doc,
        team_lead: doc.team_lead_id && profilesMap.has(doc.team_lead_id) 
          ? { email: profilesMap.get(doc.team_lead_id).email } 
          : null
      }));
    } catch (error) {
      console.error('Error fetching documents for admin:', error);
      return [];
    }
  }
};
