import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { documentService } from '@/services/documentService';
import { authService, UserProfile } from '@/services/authService';
import { FileText, UserPlus, X } from 'lucide-react';

type Permission = 'view' | 'write' | 'approve';

interface DocMeta {
  id: string;
  title: string;
  created_at: string;
}

interface Grant {
  user_id: string;
  permission: Permission;
  email: string | null;
}

const DocumentAssignment = () => {
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [accessByDoc, setAccessByDoc] = useState<Record<string, Grant[]>>({});
  const [addSelection, setAddSelection] = useState<
    Record<string, { userId?: string; level: Permission }>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyDoc, setBusyDoc] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [documentsData, usersData] = await Promise.all([
        documentService.getAllDocumentsForAdmin(),
        authService.getAllUserProfiles(),
      ]);

      const docs: DocMeta[] = (documentsData as any[]).map((d) => ({
        id: d.id,
        title: d.title,
        created_at: d.created_at,
      }));
      setDocuments(docs);
      setUsers(usersData);

      const accessEntries = await Promise.all(
        docs.map(
          async (d) =>
            [d.id, (await documentService.getDocumentAccess(d.id)) as Grant[]] as const
        )
      );
      setAccessByDoc(Object.fromEntries(accessEntries));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load documents and access',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDoc = async (docId: string) => {
    const grants = (await documentService.getDocumentAccess(docId)) as Grant[];
    setAccessByDoc((prev) => ({ ...prev, [docId]: grants }));
  };

  const handleGrant = async (docId: string, userId: string, level: Permission) => {
    setBusyDoc(docId);
    try {
      const ok = await documentService.grantAccess(docId, userId, level);
      if (!ok) throw new Error('grant failed');
      await refreshDoc(docId);
      setAddSelection((prev) => ({ ...prev, [docId]: { userId: undefined, level: 'view' } }));
    } catch {
      toast({ title: 'Error', description: 'Failed to update access', variant: 'destructive' });
    } finally {
      setBusyDoc(null);
    }
  };

  const handleRevoke = async (docId: string, userId: string) => {
    setBusyDoc(docId);
    try {
      const ok = await documentService.revokeAccess(docId, userId);
      if (!ok) throw new Error('revoke failed');
      await refreshDoc(docId);
    } catch {
      toast({ title: 'Error', description: 'Failed to remove access', variant: 'destructive' });
    } finally {
      setBusyDoc(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileText className="h-5 w-5" />
          <span>Document Access</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {documents.map((document) => {
            const grants = accessByDoc[document.id] ?? [];
            const grantedIds = new Set(grants.map((g) => g.user_id));
            const availableUsers = users.filter((u) => !grantedIds.has(u.user_id));
            const selection = addSelection[document.id] ?? { level: 'view' as Permission };
            const busy = busyDoc === document.id;

            return (
              <div key={document.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{document.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Created {new Date(document.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {busy && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                  )}
                </div>

                <div className="space-y-2">
                  {grants.length === 0 && (
                    <p className="text-sm text-gray-500">No users have access yet.</p>
                  )}
                  {grants.map((grant) => (
                    <div
                      key={grant.user_id}
                      className="flex items-center justify-between gap-2 p-2 bg-gray-50 rounded"
                    >
                      <span className="text-sm flex-1 truncate">
                        {grant.email ?? grant.user_id}
                      </span>
                      <Select
                        value={grant.permission}
                        onValueChange={(level) =>
                          handleGrant(document.id, grant.user_id, level as Permission)
                        }
                        disabled={busy}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="view">View</SelectItem>
                          <SelectItem value="write">Write</SelectItem>
                          <SelectItem value="approve">Approve</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(document.id, grant.user_id)}
                        disabled={busy}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t">
                  <Select
                    value={selection.userId ?? ''}
                    onValueChange={(userId) =>
                      setAddSelection((prev) => ({
                        ...prev,
                        [document.id]: { userId, level: prev[document.id]?.level ?? 'view' },
                      }))
                    }
                    disabled={busy || availableUsers.length === 0}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select user..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          {user.email} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={selection.level}
                    onValueChange={(level) =>
                      setAddSelection((prev) => ({
                        ...prev,
                        [document.id]: {
                          userId: prev[document.id]?.userId,
                          level: level as Permission,
                        },
                      }))
                    }
                    disabled={busy}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View</SelectItem>
                      <SelectItem value="write">Write</SelectItem>
                      <SelectItem value="approve">Approve</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() =>
                      selection.userId &&
                      handleGrant(document.id, selection.userId, selection.level)
                    }
                    disabled={busy || !selection.userId}
                    className="flex items-center"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>
            );
          })}
          {documents.length === 0 && (
            <div className="text-center p-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No documents found</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentAssignment;
