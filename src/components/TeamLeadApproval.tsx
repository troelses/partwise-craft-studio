
import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  Clock,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { documentService } from '@/services/documentService';
import { kerneopgaverService } from '@/services/kerneopgaverService';
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
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  // Kerneopgave subsections waiting for approval. They are not listed in this
  // dashboard yet, but approve_document publishes them, so the count must be
  // shown or the button would understate what it is about to do.
  const [pendingSubsections, setPendingSubsections] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    fetchSectionsForApproval();
  }, [documentId]);

  const fetchSectionsForApproval = async () => {
    try {
      setIsLoading(true);
      const data = await documentService.getDocumentSectionsForApproval(documentId);
      setSections(data);
      setPendingSubsections(await kerneopgaverService.countPendingSubsections(documentId));
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

  // Exactly the sections that show an individual "Approve & Publish" button, so
  // the bulk action can never publish something the user could not publish one
  // at a time.
  const pendingSections = sections.filter(
    section => section.draft_content && !section.is_approved
  );

  const handleApproveAll = async () => {
    setConfirmAllOpen(false);
    setIsApprovingAll(true);
    try {
      const { sections: approvedSections, kerneopgaveSections } =
        await documentService.approveDocument(documentId);

      toast({
        title: 'Success',
        description:
          `${approvedSections} ${approvedSections === 1 ? 'section' : 'sections'} and ` +
          `${kerneopgaveSections} kerneopgave ` +
          `${kerneopgaveSections === 1 ? 'subsection' : 'subsections'} ` +
          'were approved and published.',
      });

      await fetchSectionsForApproval();
      onApprovalChange?.();
    } catch (error) {
      // One transaction: if this failed, nothing was published, so there is no
      // partial state to explain or clean up.
      toast({
        title: 'Approval failed',
        description:
          error instanceof Error && error.message
            ? `${error.message}. Nothing was published.`
            : 'Nothing was published.',
        variant: 'destructive',
      });
    } finally {
      setIsApprovingAll(false);
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

        {pendingSections.length + pendingSubsections > 0 && (
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <p className="text-sm text-yellow-700">
              <strong>{pendingSections.length}</strong>{' '}
              {pendingSections.length === 1 ? 'section' : 'sections'}
              {pendingSubsections > 0 && (
                <>
                  {' '}and <strong>{pendingSubsections}</strong> kerneopgave{' '}
                  {pendingSubsections === 1 ? 'subsection' : 'subsections'}
                </>
              )}{' '}
              waiting for approval.
            </p>
            <Button
              onClick={() => setConfirmAllOpen(true)}
              disabled={isApprovingAll || isApproving !== null}
              className="bg-green-600 hover:bg-green-700"
            >
              {isApprovingAll
                ? 'Approving…'
                : `Approve all (${pendingSections.length + pendingSubsections})`}
            </Button>
          </div>
        )}

        <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Approve {pendingSections.length}{' '}
                {pendingSections.length === 1 ? 'section' : 'sections'}
                {pendingSubsections > 0 &&
                  ` and ${pendingSubsections} kerneopgave ${
                    pendingSubsections === 1 ? 'subsection' : 'subsections'
                  }`}
                ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Each draft becomes the published version, replacing what is
                published today, and the result is what everyone else sees and what
                Ask AI reads. Anything with no draft, and anything already approved,
                is left alone. It runs as one transaction, so either all of it
                publishes or none of it does. This cannot be undone from here — the
                previous published text is overwritten.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleApproveAll}>
                Approve and publish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
                      disabled={isApproving === section.id || isApprovingAll}
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
