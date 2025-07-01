
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { documentService } from '@/services/documentService';
import { authService, UserProfile } from '@/services/authService';
import { FileText, Users, UserCheck } from 'lucide-react';

interface DocumentWithTeamLead {
  id: string;
  title: string;
  team_lead_id: string | null;
  team_lead: { email: string } | null;
  created_at: string;
}

const DocumentAssignment = () => {
  const [documents, setDocuments] = useState<DocumentWithTeamLead[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [assigningDocument, setAssigningDocument] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [documentsData, usersData] = await Promise.all([
        documentService.getAllDocumentsForAdmin(),
        authService.getAllUserProfiles()
      ]);
      
      setDocuments(documentsData as DocumentWithTeamLead[]);
      setUsers(usersData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load documents and users",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssignTeamLead = async (documentId: string, userId: string) => {
    setAssigningDocument(documentId);
    try {
      const success = await documentService.assignTeamLead(documentId, userId);
      if (success) {
        toast({
          title: "Success",
          description: "Team lead assigned successfully",
        });
        fetchData(); // Refresh data
      } else {
        throw new Error('Failed to assign team lead');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to assign team lead",
        variant: "destructive",
      });
    } finally {
      setAssigningDocument(null);
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
          <span>Document Assignments</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {documents.map((document) => (
            <div key={document.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <h3 className="font-medium">{document.title}</h3>
                <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                  <UserCheck className="h-4 w-4" />
                  <span>
                    Team Lead: {document.team_lead?.email || 'Not assigned'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Created {new Date(document.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Select
                  value={document.team_lead_id || ''}
                  onValueChange={(userId) => handleAssignTeamLead(document.id, userId)}
                  disabled={assigningDocument === document.id}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Assign team lead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No team lead</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.email} ({user.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assigningDocument === document.id && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                )}
              </div>
            </div>
          ))}
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
