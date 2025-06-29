
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Specialty } from '@/types/document';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Check, Eye, Pencil, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSpecialties = async () => {
      try {
        setIsLoading(true);
        
        // Fetch from specialer table for the specialty names
        const { data, error } = await supabase
          .from('specialer')
          .select('Specialenavn')
          .order('Specialenavn');
        
        if (error) {
          throw error;
        }

        // Extract unique specialties, filtering out null values
        const uniqueSpecialties = data
          .map(item => item.Specialenavn)
          .filter(specialty => specialty !== null) as string[];
        
        setSpecialties(uniqueSpecialties);
      } catch (error) {
        console.error('Error fetching specialties:', error);
        toast({
          title: "Error",
          description: "Could not load specialties",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSpecialties();
  }, [toast]);

  const handleView = async (specialty: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      // Check if a document already exists for this specialty
      const { data: existingDoc, error } = await supabase
        .from('training_documents')
        .select('id')
        .eq('specialty', specialty)
        .maybeSingle();

      if (error) {
        console.error('Error checking for existing document:', error);
        toast({
          title: "Error",
          description: "Failed to check for existing document",
          variant: "destructive",
        });
        return;
      }

      if (existingDoc) {
        // Navigate to existing document
        navigate(`/documents/${existingDoc.id}`);
      } else {
        // Create new document with template
        const { data: newDoc, error: createError } = await supabase
          .from('training_documents')
          .insert({
            title: `${specialty} - Specialebeskrivelse`,
            specialty: specialty,
            introduction: `Specialebeskrivelse for ${specialty}`
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating document:', createError);
          toast({
            title: "Error",
            description: "Failed to create new document",
            variant: "destructive",
          });
          return;
        }

        // Navigate to the new document
        navigate(`/documents/${newDoc.id}`);
      }
    } catch (error) {
      console.error('Error handling view:', error);
      toast({
        title: "Error",
        description: "Failed to open document",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (specialty: string, e: React.MouseEvent) => {
    e.stopPropagation();
    handleView(specialty, e); // For now, edit is the same as view
  };

  const handleShare = (specialty: string, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log(`Share ${specialty}`);
    toast({
      title: "Info",
      description: "Share functionality coming soon",
    });
  };

  return (
    <div className="mb-6">
      <ScrollArea className="h-[350px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Specialer</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Loading state */}
            {isLoading && (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-4">
                  Loading specialties...
                </TableCell>
              </TableRow>
            )}

            {/* Error state if no specialties */}
            {!isLoading && specialties.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center py-4">
                  No specialties found
                </TableCell>
              </TableRow>
            )}
            
            {/* One specialty per row */}
            {!isLoading && specialties.map((specialty) => (
              <TableRow 
                key={specialty}
                className={`cursor-pointer ${activeSpecialty === specialty ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => onSpecialtyChange(specialty)}
              >
                <TableCell className="flex items-center gap-2">
                  {activeSpecialty === specialty && <Check className="h-4 w-4 text-blue-600" />}
                  <span>{specialty}</span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={(e) => handleView(specialty, e)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => handleEdit(specialty, e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={(e) => handleShare(specialty, e)}>
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
