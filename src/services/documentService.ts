import { Document, DocumentSection } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TEMPLATE_ID } from '@/constants/template';

/** One version of a document. Versions sharing a versionGroupId are the same
 *  logical document; exactly one of them is current. */
/** Shape of a version row as returned by the versions query, including the
 *  joined template name. Supabase returns a to-one relation as an object, but
 *  tolerate an array form too. */
interface DocumentVersionRow {
  id: string;
  title: string;
  version_group_id: string;
  version_number: number;
  is_current: boolean;
  template_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  templates: { name: string } | { name: string }[] | null;
}

/** Shared implementation for the two version permission checks, which differ
 *  only in which SECURITY DEFINER helper they call. */
const checkVersionPermission = async (
  documentId: string,
  fn: 'can_manage_document_versions' | 'can_publish_document_version'
): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: source, error: sourceError } = await supabase
      .from('documents')
      .select('version_group_id')
      .eq('id', documentId)
      .maybeSingle();

    if (sourceError || !source) return false;

    const { data, error } = await supabase.rpc(fn, {
      p_user_id: user.id,
      p_version_group_id: source.version_group_id,
    });

    if (error) {
      console.error(`Error checking version permission (${fn}):`, error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error(`Error checking version permission (${fn}):`, error);
    return false;
  }
};

export interface DocumentVersion {
  id: string;
  title: string;
  versionGroupId: string;
  versionNumber: number;
  isCurrent: boolean;
  templateId: string | null;
  templateName: string | null;
  createdAt: string;
  updatedAt: string;
}

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
        // Only the current version of each document appears in listings.
        .eq('is_current', true)
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

      // First, get the template sections to define the structure. Resolve against
      // the document's own template so documents created with an older template
      // keep rendering their original section structure.
      const { data: templateSections, error: templateError } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', docData.template_id || DEFAULT_TEMPLATE_ID)
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
          template_id: DEFAULT_TEMPLATE_ID,
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

  addSection: async (_documentId: string, _section: Omit<DocumentSection, 'id' | 'documentId' | 'createdAt' | 'updatedAt'>): Promise<DocumentSection> => {
    // Free-form section creation is not supported; all sections are derived from
    // the document template. Use updateSection to save content for a template section.
    throw new Error('addSection is not implemented. Save content via updateSection instead.');
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
    try {
      const { error } = await supabase
        .from('document_sections')
        .delete()
        .eq('id', sectionId)
        .eq('document_id', documentId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting section:', error);
      throw error;
    }
  },

  // --- Versions ---------------------------------------------------------------

  // List every version of the document group that the given document belongs to,
  // newest version first.
  getDocumentVersions: async (documentId: string): Promise<DocumentVersion[]> => {
    try {
      const { data: source, error: sourceError } = await supabase
        .from('documents')
        .select('version_group_id')
        .eq('id', documentId)
        .maybeSingle();

      if (sourceError) throw sourceError;
      if (!source) return [];

      const { data, error } = await supabase
        .from('documents')
        .select('id, title, version_group_id, version_number, is_current, template_id, created_at, updated_at, templates ( name )')
        .eq('version_group_id', source.version_group_id)
        .order('version_number', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as unknown as DocumentVersionRow[];

      return rows.map(row => {
        const template = Array.isArray(row.templates) ? row.templates[0] : row.templates;

        return {
          id: row.id,
          title: row.title,
          versionGroupId: row.version_group_id,
          versionNumber: row.version_number,
          isCurrent: row.is_current,
          templateId: row.template_id,
          templateName: template?.name ?? null,
          createdAt: row.created_at || '',
          updatedAt: row.updated_at || '',
        };
      });
    } catch (error) {
      console.error('Error fetching document versions:', error);
      throw error;
    }
  },

  // Create a new version of a document, optionally on a different template.
  // The new version is not made current — promote it with setCurrentVersion.
  // Returns the new version's document id.
  createDocumentVersion: async (
    sourceDocumentId: string,
    templateId: string,
    copyContent: boolean = true
  ): Promise<string> => {
    const { data, error } = await supabase.rpc('create_document_version', {
      p_source_document_id: sourceDocumentId,
      p_template_id: templateId,
      p_copy_content: copyContent,
    });

    if (error) {
      console.error('Error creating document version:', error);
      throw error;
    }

    return data as string;
  },

  // Promote a version to be the current one for its group.
  setCurrentVersion: async (documentId: string): Promise<void> => {
    const { error } = await supabase.rpc('set_current_document_version', {
      p_document_id: documentId,
    });

    if (error) {
      console.error('Error setting current version:', error);
      throw error;
    }
  },

  // Whether the current user may create a version of this document's group.
  // Requires write-level access (document_access), or admin.
  canManageVersions: async (documentId: string): Promise<boolean> => {
    return checkVersionPermission(documentId, 'can_manage_document_versions');
  },

  // Whether the current user may promote a version to current. Promoting
  // decides what everyone sees by default, so it requires approve-level access.
  canPublishVersion: async (documentId: string): Promise<boolean> => {
    return checkVersionPermission(documentId, 'can_publish_document_version');
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
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!section) throw new Error(`Section ${sectionId} not found`);

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
