
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import DocumentEditor from '@/components/DocumentEditor';
import { Document } from '@/types/document';
import { documentService } from '@/services/documentService';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const DocumentView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

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
            <Button 
              variant="outline"
              onClick={handleDeleteDocument}
              disabled={isDeleting}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? 'Deleting...' : 'Delete Document'}
            </Button>
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
        <DocumentEditor document={document} onUpdate={handleUpdateDocument} />
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
