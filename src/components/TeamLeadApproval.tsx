
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  Clock,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { documentService } from '@/services/documentService';
import { renderRichText } from '@/utils/richTextRenderer';

interface TeamLeadApprovalProps {
  documentId: string;
  onApprovalChange?: () => void;
}

interface DocumentSectionForApproval {
  id: string;
  draft_content: any;
  published_content: any;
  is_approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  template_sections: {
    id: string;
    name: string;
    position: number;
    description?: string;
  };
}

const TeamLeadApproval: React.FC<TeamLeadApprovalProps> = ({ 
  documentId, 
  onApprovalChange 
}) => {
  const [sections, setSections] = useState<DocumentSectionForApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSectionsForApproval();
  }, [documentId]);

  const fetchSectionsForApproval = async () => {
    try {
      setIsLoading(true);
      const data = await documentService.getDocumentSectionsForApproval(documentId);
      setSections(data);
    } catch (error) {
      console.error('Error fetching sections for approval:', error);
      toast({
        title: "Error",
        description: "Failed to load sections for approval",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveSection = async (sectionId: string) => {
    setIsApproving(sectionId);
    try {
      const success = await documentService.approveSection(sectionId);
      if (success) {
        toast({
          title: "Success",
          description: "Section approved and published successfully",
        });
        await fetchSectionsForApproval();
        onApprovalChange?.();
      } else {
        throw new Error('Approval failed');
      }
    } catch (error) {
      console.error('Error approving section:', error);
      toast({
        title: "Error",
        description: "Failed to approve section",
        variant: "destructive",
      });
    } finally {
      setIsApproving(null);
    }
  };

  const getSectionStatus = (section: DocumentSectionForApproval) => {
    if (section.is_approved) {
      return { status: 'approved', icon: CheckCircle, color: 'text-green-600' };
    }
    if (section.draft_content && !section.published_content) {
      return { status: 'pending', icon: Clock, color: 'text-yellow-600' };
    }
    if (section.draft_content && section.published_content) {
      return { status: 'modified', icon: Clock, color: 'text-blue-600' };
    }
    return { status: 'empty', icon: XCircle, color: 'text-gray-400' };
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h2 className="text-xl font-semibold mb-4 flex items-center">
          <User className="h-5 w-5 mr-2" />
          Redaktør Approval Dashboard
        </h2>
        <p className="text-gray-600 mb-4">
          Review and approve content changes for each section. Draft content will be published when approved.
        </p>
      </div>

      {sections.map((section) => {
        const { status, icon: StatusIcon, color } = getSectionStatus(section);
        const isExpanded = expandedSection === section.id;

        return (
          <div key={section.id} className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <StatusIcon className={`h-5 w-5 ${color}`} />
                  <div>
                    <h3 className="font-medium">{section.template_sections.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">
                      Status: {status === 'modified' ? 'Has Changes' : status}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {section.draft_content && !section.is_approved && (
                    <Button
                      onClick={() => handleApproveSection(section.id)}
                      disabled={isApproving === section.id}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isApproving === section.id ? 'Approving...' : 'Approve & Publish'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {isExpanded ? 'Hide' : 'Review'}
                  </Button>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Draft Content */}
                  <div>
                    <h4 className="font-medium text-blue-600 mb-2">Draft Content</h4>
                    <div className="border rounded p-3 bg-blue-50 min-h-[200px]">
                      {section.draft_content ? (
                        <div className="prose prose-sm max-w-none">
                          {renderRichText(section.draft_content)}
                        </div>
                      ) : (
                        <p className="text-gray-400 italic">No draft content</p>
                      )}
                    </div>
                  </div>

                  {/* Published Content */}
                  <div>
                    <h4 className="font-medium text-green-600 mb-2">Published Content</h4>
                    <div className="border rounded p-3 bg-green-50 min-h-[200px]">
                      {section.published_content ? (
                        <div className="prose prose-sm max-w-none">
                          {renderRichText(section.published_content)}
                        </div>
                      ) : (
                        <p className="text-gray-400 italic">No published content</p>
                      )}
                    </div>
                  </div>
                </div>

                {section.approved_at && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-600">
                      Approved on {new Date(section.approved_at).toLocaleDateString()} at{' '}
                      {new Date(section.approved_at).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {sections.length === 0 && (
        <div className="text-center p-8 bg-white rounded-lg shadow-sm">
          <p className="text-gray-500">No sections found for this document.</p>
        </div>
      )}
    </div>
  );
};

export default TeamLeadApproval;
