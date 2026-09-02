import { Document, DocumentSection } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TEMPLATE_ID } from '@/constants/template';

// Generate a simple ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

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
      const { data, error } = await supabase.rpc('approve_section', {
        section_id: sectionId,
      });
      if (error) throw error;
      return data === true;
    } catch (error) {
      console.error('Error approving section:', error);
      return false;
    }
  },

  assignTeamLead: async (
    documentId: string,
    userId: string | null
  ): Promise<boolean> => {
    try {
      const { data: doc } = await supabase
        .from('documents')
        .select('team_lead_id')
        .eq('id', documentId)
        .maybeSingle();
      const previous = doc?.team_lead_id ?? null;

      if (previous && previous !== userId) {
        await documentService.revokeAccess(documentId, previous);
      }
      if (userId) {
        const ok = await documentService.grantAccess(documentId, userId, 'approve');
        if (!ok) return false;
      }

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
