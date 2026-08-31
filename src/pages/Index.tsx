
import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DocumentList from '@/components/DocumentList';
import { Document } from '@/types/document';
import { documentService } from '@/services/documentService';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);

      // Only current versions are listed.
      const data = await documentService.getDocuments();
      setDocuments(data);
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
          <h1 className="text-3xl font-bold text-gray-900">All Documents</h1>
          <p className="text-gray-500 mt-2">Overview of all documents in the system</p>
        </div>

        <DocumentList documents={documents} isLoading={isLoading} />
      </div>
    </Layout>
  );
};

export default Index;
