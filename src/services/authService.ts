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

    console.log('Checking profile for user:', user.id);

    // Use a direct query with RPC to bypass RLS issues
    const { data, error } = await supabase.rpc('check_user_role', {
      user_id: user.id,
      required_role: 'admin'
    });

    console.log('Admin check result:', data, error);

    // If RPC fails, try direct query
    if (error) {
      console.log('RPC failed, trying direct query');
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        return null;
      }

      return profileData;
    }

    // Get the full profile
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      return null;
    }

    return profileData;
  },

  async isAdmin(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    console.log('Checking admin status for user:', user.id);
    
    try {
      // Try using the RPC function first
      const { data, error } = await supabase.rpc('check_user_role', {
        user_id: user.id,
        required_role: 'admin'
      });

      if (!error && typeof data === 'boolean') {
        console.log('Admin check via RPC:', data);
        return data;
      }

      console.log('RPC failed, falling back to profile check');
      
      // Fallback to profile check
      const profile = await this.getCurrentUserProfile();
      const isAdminResult = profile?.role === 'admin';
      console.log('Admin check via profile:', isAdminResult, profile);
      return isAdminResult;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
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
