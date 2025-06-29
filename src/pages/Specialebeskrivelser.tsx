
import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DocumentList from '@/components/DocumentList';
import { Document } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Specialebeskrivelser = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Specialebeskrivelser</h1>
          <p className="text-gray-500 mt-2">Manage your specialty descriptions</p>
        </div>

        <DocumentList documents={documents} isLoading={isLoading} />
      </div>
    </Layout>
  );
};

export default Specialebeskrivelser;
