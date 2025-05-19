
import React, { useState } from 'react';
import { 
  PlusCircle, 
  Save, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Edit
} from 'lucide-react';
import { Document, DocumentSection } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { documentService } from '@/services/documentService';
import { useToast } from '@/hooks/use-toast';

interface DocumentEditorProps {
  document: Document;
  onUpdate: (updatedDoc: Document) => void;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({ document, onUpdate }) => {
  const [currentDocument, setCurrentDocument] = useState<Document>(document);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Handle title and description update
  const handleHeaderChange = (field: 'title' | 'description', value: string) => {
    setCurrentDocument({
      ...currentDocument,
      [field]: value
    });
  };

  // Save document header changes
  const saveHeaderChanges = async () => {
    setIsSaving(true);
    try {
      const updatedDocument = await documentService.updateDocument(currentDocument);
      onUpdate(updatedDocument);
      setIsEditingHeader(false);
      toast({
        title: "Success",
        description: "Document updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update document",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle section content changes
  const handleSectionChange = (sectionId: string, field: 'title' | 'content', value: string) => {
    const updatedSections = currentDocument.sections.map(section => 
      section.id === sectionId ? { ...section, [field]: value } : section
    );
    
    setCurrentDocument({
      ...currentDocument,
      sections: updatedSections
    });
  };

  // Save section changes
  const saveSection = async (sectionId: string) => {
    setIsSaving(true);
    const section = currentDocument.sections.find(s => s.id === sectionId);
    
    if (!section) return;
    
    try {
      await documentService.updateSection(section);
      setEditingSection(null);
      toast({
        title: "Success",
        description: "Section updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update section",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Add a new section
  const addSection = async () => {
    const newSectionOrder = currentDocument.sections.length > 0 
      ? Math.max(...currentDocument.sections.map(s => s.order)) + 1 
      : 1;
    
    try {
      const newSection = await documentService.addSection(currentDocument.id, {
        title: "New Section",
        content: "",
        order: newSectionOrder
      });
      
      setCurrentDocument({
        ...currentDocument,
        sections: [...currentDocument.sections, newSection]
      });
      
      // Immediately set this section to edit mode
      setEditingSection(newSection.id);
      
      toast({
        title: "Success",
        description: "New section added",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add section",
        variant: "destructive",
      });
    }
  };

  // Delete a section
  const deleteSection = async (sectionId: string) => {
    if (!window.confirm("Are you sure you want to delete this section?")) return;
    
    try {
      await documentService.deleteSection(currentDocument.id, sectionId);
      setCurrentDocument({
        ...currentDocument,
        sections: currentDocument.sections.filter(s => s.id !== sectionId)
      });
      toast({
        title: "Success",
        description: "Section deleted",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete section",
        variant: "destructive",
      });
    }
  };

  // Move section up or down
  const moveSection = async (sectionId: string, direction: 'up' | 'down') => {
    const sectionIndex = currentDocument.sections.findIndex(s => s.id === sectionId);
    if (
      (direction === 'up' && sectionIndex === 0) || 
      (direction === 'down' && sectionIndex === currentDocument.sections.length - 1)
    ) {
      return;
    }
    
    const newSections = [...currentDocument.sections];
    const targetIndex = direction === 'up' ? sectionIndex - 1 : sectionIndex + 1;
    
    // Swap the sections
    [newSections[sectionIndex], newSections[targetIndex]] = 
      [newSections[targetIndex], newSections[sectionIndex]];
    
    // Update the order property
    newSections.forEach((section, index) => {
      section.order = index + 1;
    });
    
    setCurrentDocument({
      ...currentDocument,
      sections: newSections
    });
    
    // Update the orders in the database
    try {
      await Promise.all([
        documentService.updateSection(newSections[sectionIndex]),
        documentService.updateSection(newSections[targetIndex])
      ]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reorder sections",
        variant: "destructive",
      });
    }
  };

  // Sort sections by order
  const sortedSections = [...currentDocument.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Document header */}
      <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
        {isEditingHeader ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
              <Input
                id="title"
                value={currentDocument.title}
                onChange={(e) => handleHeaderChange('title', e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
              <Textarea
                id="description"
                value={currentDocument.description}
                onChange={(e) => handleHeaderChange('description', e.target.value)}
                className="w-full"
                rows={3}
              />
            </div>
            <div className="flex space-x-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => setIsEditingHeader(false)}
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
              <h1 className="text-2xl font-bold">{currentDocument.title}</h1>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setIsEditingHeader(true)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-gray-500 mt-2">{currentDocument.description}</p>
          </div>
        )}
      </div>

      {/* Document sections */}
      <div className="space-y-4">
        {sortedSections.map((section) => (
          <div key={section.id} className="document-section bg-white">
            {editingSection === section.id ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor={`section-title-${section.id}`} className="block text-sm font-medium mb-1">Section Title</label>
                  <Input
                    id={`section-title-${section.id}`}
                    value={section.title}
                    onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label htmlFor={`section-content-${section.id}`} className="block text-sm font-medium mb-1">Content</label>
                  <Textarea
                    id={`section-content-${section.id}`}
                    value={section.content}
                    onChange={(e) => handleSectionChange(section.id, 'content', e.target.value)}
                    className="w-full min-h-[150px]"
                    rows={6}
                  />
                </div>
                <div className="flex space-x-2 justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => setEditingSection(null)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => saveSection(section.id)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : <><Save className="h-4 w-4 mr-1" /> Save</>}
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="document-section-header">
                  <h3 className="text-lg font-medium">{section.title}</h3>
                  <div className="flex space-x-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => moveSection(section.id, 'up')} 
                      disabled={section.order === 1}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => moveSection(section.id, 'down')}
                      disabled={section.order === sortedSections.length}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => setEditingSection(section.id)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => deleteSection(section.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 whitespace-pre-wrap">
                  {section.content || <span className="text-gray-400 italic">No content</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add section button */}
      <Button 
        onClick={addSection} 
        variant="outline"
        className="mt-6"
      >
        <PlusCircle className="h-4 w-4 mr-2" />
        Add Section
      </Button>
    </div>
  );
};

export default DocumentEditor;
