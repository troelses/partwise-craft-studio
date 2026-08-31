
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Specialty } from '@/types/document';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, Eye, Pencil, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Document {
  id: string;
  title: string;
  template_id: string;
  version_number: number;
  created_at: string;
  updated_at: string;
}

interface SpecialtyListProps {
  activeCategory: string;
  activeSpecialty: Specialty;
  onSpecialtyChange: (specialty: Specialty) => void;
}

const SpecialtyList: React.FC<SpecialtyListProps> = ({ 
  activeCategory, 
  activeSpecialty, 
  onSpecialtyChange 
}) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        
        // List the current version of every document, regardless of which
        // template that version is built on.
        const { data, error } = await supabase
          .from('documents')
          .select('*')
          .eq('is_current', true)
          .order('title');
        
        if (error) {
          throw error;
        }

        setDocuments(data || []);
      } catch (error) {
        console.error('Error fetching documents:', error);
        toast({
          title: "Error",
          description: "Could not load documents",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [toast]);

  const handleView = async (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/documents/${documentId}`);
  };

  const handleEdit = (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    handleView(documentId, e); // For now, edit is the same as view
  };

  const handleShare = (documentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`Share ${documentTitle}`);
    toast({
      title: "Info",
      description: "Share functionality coming soon",
    });
  };

  return (
    <div className="mb-6 flex-1">
      <ScrollArea className="h-full">
        <Table>
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>Specialebeskrivelser</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Loading state */}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-4">
                  Loading documents...
                </TableCell>
              </TableRow>
            )}

            {/* Error state if no documents */}
            {!isLoading && documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-4">
                  No documents found
                </TableCell>
              </TableRow>
            )}
            
            {/* One document per row */}
            {!isLoading && documents.map((document) => (
              <TableRow 
                key={document.id}
                className={`cursor-pointer ${activeSpecialty === document.title ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => onSpecialtyChange(document.title)}
              >
                <TableCell className="flex items-center gap-2">
                  {activeSpecialty === document.title && <Check className="h-4 w-4 text-blue-600" />}
                  <span>{document.title}</span>
                  {document.version_number > 1 && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      v{document.version_number}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={(e) => handleView(document.id, e)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => handleEdit(document.id, e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => handleShare(document.title, e)}>
                      <Share className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
};

export default SpecialtyList;
