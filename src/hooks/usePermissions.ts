
import { useState, useEffect } from 'react';
import { authService } from '@/services/authService';

export const usePermissions = (documentId: string, sectionId?: string) => {
  const [permissions, setPermissions] = useState({ canView: false, canEdit: false });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const perms = await authService.checkPermissions(documentId, sectionId);
        setPermissions(perms);
      } catch (error) {
        console.error('Error checking permissions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkPermissions();
  }, [documentId, sectionId]);

  return { ...permissions, isLoading };
};
