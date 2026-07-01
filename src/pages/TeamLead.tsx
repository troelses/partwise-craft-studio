
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Users, FileText, Calendar, ChevronRight } from 'lucide-react';

interface TeamLeadDocument {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  pendingApprovals: number;
}

const TeamLead = () => {
  const [documents, setDocuments] = useState<TeamLeadDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchTeamLeadDocuments();
  }, []);

  const fetchTeamLeadDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get documents where the current user has approver access
      const { data: grants, error: grantsError } = await supabase
        .from('document_access')
        .select('document_id')
        .eq('user_id', user.id)
        .eq('permission', 'approve');

      if (grantsError) throw grantsError;

      const docIds = (grants ?? []).map(g => g.document_id);

      const { data: docs, error: docsError } = docIds.length
        ? await supabase
            .from('documents')
            .select('id, title, created_at, updated_at')
            .in('id', docIds)
            .order('updated_at', { ascending: false })
        : { data: [], error: null };

      if (docsError) throw docsError;

      if (docs) {
        // For each document, count pending approvals
        const documentsWithApprovals = await Promise.all(
          docs.map(async (doc) => {
            const { data: sections, error: sectionsError } = await supabase
              .from('document_sections')
              .select('id')
              .eq('document_id', doc.id)
              .not('draft_content', 'is', null)
              .eq('is_approved', false);

            if (sectionsError) {
              console.error('Error fetching pending approvals:', sectionsError);
              return { ...doc, pendingApprovals: 0 };
            }

            return {
              ...doc,
              pendingApprovals: sections?.length || 0
            };
          })
        );

        setDocuments(documentsWithApprovals);
      }
    } catch (error) {
      console.error('Error fetching team lead documents:', error);
      toast({
        title: "Error",
        description: "Failed to load your assigned documents",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-4">
            <Users className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Redaktør Dashboard</h1>
          </div>
          <p className="text-gray-600">
            Manage and approve content for documents assigned to you as redaktør.
          </p>
        </div>

        {documents.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-lg shadow-sm">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-medium text-gray-800 mb-2">No Documents Assigned</h2>
            <p className="text-gray-500">
              You are not currently assigned as redaktør for any documents.
            </p>
          </div>
        ) : (
          <div className="grid gap-6">
            {documents.map((document) => (
              <div key={document.id} className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <FileText className="h-5 w-5 text-gray-500" />
                      <h3 className="text-lg font-semibold text-gray-900">
                        {document.title}
                      </h3>
                      {document.pendingApprovals > 0 && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          {document.pendingApprovals} pending approval{document.pendingApprovals !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-500 mb-4">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Updated {new Date(document.updated_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    to={`/documents/${document.id}`}
                    state={{ from: '/team-lead' }}
                  >
                    <Button className="flex items-center space-x-2">
                      <span>Review Document</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default TeamLead;
