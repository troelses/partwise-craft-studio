
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { documentService } from '@/services/documentService';
import { useToast } from '@/hooks/use-toast';
import { Document, DocumentCategory, Specialty } from '@/types/document';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

const specialties: Specialty[] = [
  'Akutmedicin',
  'Almen medicin',
  'Anæstesiologi',
  'Arbejdsmedicin',
  'Børne- og ungdomspsykiatri',
  'Dermato-venerologi',
  'Gynækologi og obstetrik',
  'Intern medicinske specialer',
  'Kirurgiske specialer',
  'Klinisk biokemi',
  'Klinisk farmakologi',
  'Klinisk fysiologi og nuklearmedicin',
  'Klinisk genetik',
  'Klinisk immunologi',
  'Klinisk mikrobiologi',
  'Klinisk onkologi',
  'Neurokirurgi',
  'Neurologi',
  'Oftalmologi',
  'Ortopædisk kirurgi',
  'Oto-rhino-laryngologi',
  'Patologisk anatomi og cytologi',
  'Psykiatri',
  'Pædiatri',
  'Radiologi',
  'Retsmedicin',
  'Samfundsmedicin',
];

const NewDocumentForm: React.FC = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('Specialebeskrivelser');
  const [specialty, setSpecialty] = useState<Specialty>('Akutmedicin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Title is required",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const newDocument: Omit<Document, 'id' | 'createdAt' | 'updatedAt'> = {
        title,
        description,
        category,
        specialty,
        sections: []
      };
      
      const createdDocument = await documentService.createDocument(newDocument);
      toast({
        title: "Success",
        description: "Document created successfully",
      });
      navigate(`/documents/${createdDocument.id}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create document",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow-sm animate-fade-in">
      <h1 className="text-2xl font-bold mb-6">Create New Document</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">Document Title</label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter document title"
            className="w-full"
            required
          />
        </div>
        
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter document description"
            className="w-full"
            rows={4}
          />
        </div>
        
        <div>
          <label htmlFor="category" className="block text-sm font-medium mb-1">Category</label>
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as DocumentCategory)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Specialebeskrivelser">Specialebeskrivelser</SelectItem>
              <SelectItem value="Målbeskrivelser">Målbeskrivelser</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <label htmlFor="specialty" className="block text-sm font-medium mb-1">Specialty</label>
          <Select
            value={specialty}
            onValueChange={(value) => setSpecialty(value as Specialty)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a specialty" />
            </SelectTrigger>
            <SelectContent>
              <ScrollArea className="h-[200px]">
                {specialties.map((spec) => (
                  <SelectItem key={spec} value={spec}>
                    {spec}
                  </SelectItem>
                ))}
              </ScrollArea>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex justify-end space-x-3">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => navigate('/')}
          >
            Cancel
          </Button>
          <Button 
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Document'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default NewDocumentForm;
