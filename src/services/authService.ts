
import { supabase } from '@/integrations/supabase/client';
import { UserRole, UserProfile } from '@/types/auth';

export const authService = {
  // Get current user's profile
  getCurrentUserProfile: async (): Promise<UserProfile | null> => {
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

    return data ? {
      id: data.id,
      userId: data.user_id,
      email: data.email,
      role: data.role as UserRole,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    } : null;
  },

  // Check if user is admin
  isAdmin: async (): Promise<boolean> => {
    const profile = await authService.getCurrentUserProfile();
    return profile?.role === 'admin';
  },

  // Get all users (admin only)
  getAllUsers: async (): Promise<UserProfile[]> => {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      return [];
    }

    return data.map(profile => ({
      id: profile.id,
      userId: profile.user_id,
      email: profile.email,
      role: profile.role as UserRole,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    }));
  },

  // Update user role (admin only)
  updateUserRole: async (userId: string, role: UserRole): Promise<boolean> => {
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

  // Check user permissions for document/section
  checkPermissions: async (documentId: string, sectionId?: string): Promise<{ canView: boolean; canEdit: boolean }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { canView: false, canEdit: false };

    // Check if user is admin (admins have full access)
    const isAdmin = await authService.isAdmin();
    if (isAdmin) return { canView: true, canEdit: true };

    // Check specific permissions
    let query = supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('document_id', documentId);

    if (sectionId) {
      query = query.eq('section_id', sectionId);
    } else {
      query = query.is('section_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error checking permissions:', error);
      return { canView: false, canEdit: false };
    }

    if (data && data.length > 0) {
      const permission = data[0];
      return {
        canView: permission.can_view,
        canEdit: permission.can_edit,
      };
    }

    // Default permissions for regular users
    return { canView: true, canEdit: false };
  },

  // Grant permissions (admin only)
  grantPermissions: async (
    userId: string,
    documentId: string,
    canView: boolean,
    canEdit: boolean,
    sectionId?: string
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('user_permissions')
      .upsert({
        user_id: userId,
        document_id: documentId,
        section_id: sectionId || null,
        can_view: canView,
        can_edit: canEdit,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error granting permissions:', error);
      return false;
    }

    return true;
  },

  // Revoke permissions (admin only)
  revokePermissions: async (userId: string, documentId: string, sectionId?: string): Promise<boolean> => {
    let query = supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('document_id', documentId);

    if (sectionId) {
      query = query.eq('section_id', sectionId);
    } else {
      query = query.is('section_id', null);
    }

    const { error } = await query;

    if (error) {
      console.error('Error revoking permissions:', error);
      return false;
    }

    return true;
  },
};
