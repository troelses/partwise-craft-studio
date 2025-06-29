
import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DocumentList from '@/components/DocumentList';
import SpecialtyList from '@/components/SpecialtyList';
import { Document, DocumentCategory, Specialty } from '@/types/document';
import { documentService } from '@/services/documentService';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [activeCategory, setActiveCategory] = useState<DocumentCategory | 'All'>('All');
  const [activeSpecialty, setActiveSpecialty] = useState<Specialty>('All');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      
      // Fetch from Supabase training_documents table
      const { data, error } = await supabase
        .from('training_documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching documents:', error);
        toast({
          title: "Error",
          description: "Failed to fetch documents from database",
          variant: "destructive",
        });
        return;
      }

      // Transform Supabase data to match our Document interface
      const transformedDocuments: Document[] = (data || []).map(doc => ({
        id: doc.id.toString(),
        title: doc.title,
        description: doc.introduction || '',
        category: 'Specialebeskrivelser' as DocumentCategory, // All docs from training_documents are specialty descriptions
        specialty: doc.specialty,
        sections: [], // We'll load sections separately when needed
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }));

      setDocuments(transformedDocuments);
      setFilteredDocuments(transformedDocuments);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Error",
        description: "Failed to fetch documents",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter documents based on category and specialty
  useEffect(() => {
    let filtered = documents;

    if (activeCategory !== 'All') {
      filtered = filtered.filter(doc => doc.category === activeCategory);
    }

    if (activeSpecialty !== 'All') {
      filtered = filtered.filter(doc => doc.specialty === activeSpecialty);
    }

    setFilteredDocuments(filtered);
  }, [documents, activeCategory, activeSpecialty]);

  const categories: (DocumentCategory | 'All')[] = ['All', 'Specialebeskrivelser', 'Målbeskrivelser'];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
          <p className="text-gray-500 mt-2">Manage your specialty descriptions and goal descriptions</p>
        </div>

        {/* Category Filter */}
        <div className="flex space-x-2 border-b">
          {categories.map((category) => (
            <Button
              key={category}
              variant={activeCategory === category ? "default" : "ghost"}
              onClick={() => setActiveCategory(category)}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-document-blue"
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Specialty Filter - Only show for Målbeskrivelser */}
        {activeCategory === 'Målbeskrivelser' && (
          <SpecialtyList 
            activeSpecialty={activeSpecialty}
            onSpecialtyChange={setActiveSpecialty}
          />
        )}

        {/* Document List */}
        <DocumentList documents={filteredDocuments} isLoading={isLoading} />
      </div>
    </Layout>
  );
};

export default Index;
