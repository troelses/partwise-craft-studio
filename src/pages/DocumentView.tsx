
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import DocumentEditor from '@/components/DocumentEditor';
import DocumentContinuousView from '@/components/DocumentContinuousView';
import TeamLeadApproval from '@/components/TeamLeadApproval';
import { Document } from '@/types/document';
import { documentService } from '@/services/documentService';
import { authService } from '@/services/authService';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Trash2, Edit, Eye, Download, Shield } from 'lucide-react';
import { exportToWord, exportToPDF } from '@/utils/documentExporter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const DocumentView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewMode, setViewMode] = useState<'view' | 'edit' | 'approve'>('view');
  const [permission, setPermission] = useState<'view' | 'write' | 'approve' | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();

  // Check if we should start in edit mode with a focused section
  useEffect(() => {
    if (location.state?.viewMode) {
      setViewMode(location.state.viewMode);
    }
  }, [location.state]);

  // Determine the back path based on the referring page or document category
  const getBackPath = () => {
    const referrer = location.state?.from;
    if (referrer === '/maalbeskrivelser') {
      return '/maalbeskrivelser';
    }
    // Default to specialebeskrivelser since that's where documents are currently stored
    return '/specialebeskrivelser';
  };

  const getBackLabel = () => {
    const backPath = getBackPath();
    if (backPath === '/maalbeskrivelser') {
      return 'Back to Målbeskrivelser';
    }
    return 'Back to Specialebeskrivelser';
  };

  useEffect(() => {
    const fetchDocument = async () => {
      if (!id) return;
      
      try {
        const doc = await documentService.getDocument(id);
        if (doc) {
          setDocument(doc);
          
          // Determine the current user's permission level on this document
          const level = await documentService.getMyPermission(id);
          setPermission(level);
          setIsAdmin(await authService.isAdmin());
        } else {
          toast({
            title: "Error",
            description: "Document not found",
            variant: "destructive",
          });
          navigate(getBackPath());
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to fetch document",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDocument();
  }, [id, navigate, toast]);

  // If the user deep-linked into a mode they lack rights for, drop to view.
  useEffect(() => {
    if (permission === null) return; // still loading
    const allowEdit = permission === 'write' || permission === 'approve';
    const allowApprove = permission === 'approve';
    setViewMode((m) => {
      if (m === 'edit' && !allowEdit) return 'view';
      if (m === 'approve' && !allowApprove) return 'view';
      return m;
    });
  }, [permission]);

  const handleUpdateDocument = (updatedDoc: Document) => {
    setDocument(updatedDoc);
  };

  const handleDeleteDocument = async () => {
    if (!document || !window.confirm("Are you sure you want to delete this document?")) return;
    
    setIsDeleting(true);
    try {
      await documentService.deleteDocument(document.id);
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      navigate(getBackPath());
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
      setIsDeleting(false);
    }
  };

  const handleExport = async (format: 'word' | 'pdf') => {
    if (!document) return;
    
    try {
      if (format === 'word') {
        await exportToWord(document);
        toast({
          title: "Success",
          description: "Document exported as Word document",
        });
      } else {
        await exportToPDF(document);
        toast({
          title: "Success",
          description: "Document exported as PDF",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to export document as ${format.toUpperCase()}`,
        variant: "destructive",
      });
    }
  };

  const canEdit = permission === 'write' || permission === 'approve';
  const canApprove = permission === 'approve';
  const canDelete = isAdmin;

  return (
    <Layout>
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <Button 
            variant="ghost" 
            onClick={() => navigate(getBackPath())}
            className="flex items-center text-gray-600"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {getBackLabel()}
          </Button>
          
          {document && (
            <div className="flex items-center space-x-3">
              {/* Export Button - Only show in view mode */}
              {viewMode === 'view' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="flex items-center">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => handleExport('word')}>
                      Export as Word
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport('pdf')}>
                      Export as PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              
              {/* View/Edit/Approve Mode Toggle */}
              <div className="flex bg-gray-100 rounded-md p-1">
                <Button
                  variant={viewMode === 'view' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('view')}
                  className="flex items-center"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
                <Button
                  variant={viewMode === 'edit' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('edit')}
                  className="flex items-center"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                {isTeamLead && (
                  <Button
                    variant={viewMode === 'approve' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('approve')}
                    className="flex items-center"
                  >
                    <Shield className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                )}
              </div>
              
              {/* Delete Button */}
              <Button 
                variant="outline"
                onClick={handleDeleteDocument}
                disabled={isDeleting}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete Document'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-gray-200 rounded w-1/3"></div>
          <div className="h-6 bg-gray-200 rounded w-1/2"></div>
          <div className="h-36 bg-gray-200 rounded w-full mt-6"></div>
          <div className="h-36 bg-gray-200 rounded w-full"></div>
        </div>
      ) : document ? (
        <>
          {viewMode === 'view' && <DocumentContinuousView document={document} />}
          {viewMode === 'edit' && (
            <DocumentEditor 
              document={document} 
              onUpdate={handleUpdateDocument} 
              focusSection={location.state?.focusSection}
              preserveScroll={location.state?.preserveScroll}
            />
          )}
          {viewMode === 'approve' && isTeamLead && (
            <TeamLeadApproval 
              documentId={document.id} 
              onApprovalChange={() => {
                // Optionally refresh document data after approval
                console.log('Section approved, document updated');
              }} 
            />
          )}
        </>
      ) : (
        <div className="text-center p-12">
          <h2 className="text-xl font-medium text-gray-800">Document not found</h2>
          <p className="text-gray-500 mt-2">The document you're looking for doesn't exist or has been deleted.</p>
          <Button 
            onClick={() => navigate(getBackPath())}
            className="mt-6"
          >
            {getBackLabel()}
          </Button>
        </div>
      )}
    </Layout>
  );
};

export default DocumentView;
