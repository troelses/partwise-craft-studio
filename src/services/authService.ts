
import { supabase } from '@/integrations/supabase/client';

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  document_id: string;
  section_id: string | null;
  can_view: boolean;
  can_edit: boolean;
  created_at: string;
  updated_at: string;
}

export const authService = {
  async getCurrentUserProfile(): Promise<UserProfile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }

    return data;
  },

  async isAdmin(): Promise<boolean> {
    const profile = await this.getCurrentUserProfile();
    return profile?.role === 'admin';
  },

  async getAllUserProfiles(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching user profiles:', error);
      return [];
    }

    return data || [];
  },

  async updateUserRole(userId: string, role: string): Promise<boolean> {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating user role:', error);
      return false;
    }

    return true;
  },

  async getUserPermissions(userId: string, documentId?: string): Promise<UserPermission[]> {
    let query = supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId);

    if (documentId) {
      query = query.eq('document_id', documentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching user permissions:', error);
      return [];
    }

    return data || [];
  },

  async setUserPermission(
    userId: string,
    documentId: string,
    canView: boolean,
    canEdit: boolean,
    sectionId?: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('user_permissions')
      .upsert({
        user_id: userId,
        document_id: documentId,
        section_id: sectionId || null,
        can_view: canView,
        can_edit: canEdit,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error setting user permission:', error);
      return false;
    }

    return true;
  },

  async checkPermissions(documentId: string, sectionId?: string): Promise<{ canView: boolean; canEdit: boolean }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { canView: false, canEdit: false };

    // Check if user is admin - admins have all permissions
    const profile = await this.getCurrentUserProfile();
    if (profile?.role === 'admin') {
      return { canView: true, canEdit: true };
    }

    // Get user permissions for this document/section
    const permissions = await this.getUserPermissions(user.id, documentId);
    
    // Find the most specific permission (section-specific over document-wide)
    let relevantPermission = permissions.find(p => p.section_id === sectionId);
    if (!relevantPermission) {
      relevantPermission = permissions.find(p => p.section_id === null);
    }

    if (!relevantPermission) {
      return { canView: false, canEdit: false };
    }

    return {
      canView: relevantPermission.can_view,
      canEdit: relevantPermission.can_edit
    };
  }
};
