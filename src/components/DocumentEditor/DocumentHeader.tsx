
import React, { useState } from 'react';
import { Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Document } from '@/types/document';

interface DocumentHeaderProps {
  document: Document;
  onUpdate: (updatedDoc: Document) => void;
}

const DocumentHeader: React.FC<DocumentHeaderProps> = ({ document, onUpdate }) => {
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(document.title);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const saveHeaderChanges = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('documents')
        .update({ 
          title: currentTitle,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (error) throw error;

      const updatedDocument = { ...document, title: currentTitle };
      onUpdate(updatedDocument);
      
      toast({
        title: "Success",
        description: "Document updated successfully",
      });
      setIsEditingHeader(false);
    } catch (error) {
      console.error('Error updating document:', error);
      toast({
        title: "Error",
        description: "Failed to update document",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
      {isEditingHeader ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
            <Input
              id="title"
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex space-x-2 justify-end">
            <Button 
              variant="outline" 
              onClick={() => {
                setCurrentTitle(document.title);
                setIsEditingHeader(false);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={saveHeaderChanges}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">{document.title}</h1>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setIsEditingHeader(true)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-700">
              This document follows the Specialebeskrivelser template. All required sections are provided below.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentHeader;
