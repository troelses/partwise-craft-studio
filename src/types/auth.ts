
export type UserRole = 'admin' | 'editor' | 'viewer';

export interface UserPermission {
  id: string;
  userId: string;
  documentId: string;
  sectionId?: string; // If null, applies to entire document
  canView: boolean;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
