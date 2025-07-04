
import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DocumentList from '@/components/DocumentList';
import SpecialtyList from '@/components/SpecialtyList';
import { Document, Specialty } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Specialebeskrivelser = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [activeSpecialty, setActiveSpecialty] = useState<Specialty>('All');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    let filtered = documents;

    if (activeSpecialty !== 'All') {
      filtered = filtered.filter(doc => doc.specialty === activeSpecialty);
    }

    setFilteredDocuments(filtered);
  }, [documents, activeSpecialty]);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      
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

      const transformedDocuments: Document[] = (data || []).map(doc => ({
        id: doc.id.toString(),
        title: doc.title,
        description: doc.introduction || '',
        category: 'Specialebeskrivelser',
        specialty: doc.specialty,
        sections: [],
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }));

      setDocuments(transformedDocuments);
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

  return (
    <Layout>
      <div className="min-h-screen flex flex-col">
        {/* Fixed Header Section */}
        <div className="bg-white sticky top-0 z-10 pb-6 border-b border-gray-200">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Specialebeskrivelser</h1>
              <p className="text-gray-500 mt-2">Manage your specialty descriptions</p>
            </div>

            <SpecialtyList 
              activeCategory="Specialebeskrivelser"
              activeSpecialty={activeSpecialty}
              onSpecialtyChange={setActiveSpecialty}
            />
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 pt-6">
          <DocumentList documents={filteredDocuments} isLoading={isLoading} />
        </div>
      </div>
    </Layout>
  );
};

export default Specialebeskrivelser;
