
import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DocumentList from '@/components/DocumentList';
import SpecialtyList from '@/components/SpecialtyList';
import { Document, Specialty } from '@/types/document';
import { useToast } from '@/hooks/use-toast';

const Maalbeskrivelser = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [activeSpecialty, setActiveSpecialty] = useState<Specialty>('All');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // For now, we'll show empty state since there's no data for Målbeskrivelser yet
    setDocuments([]);
    setFilteredDocuments([]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let filtered = documents;

    if (activeSpecialty !== 'All') {
      filtered = filtered.filter(doc => doc.specialty === activeSpecialty);
    }

    setFilteredDocuments(filtered);
  }, [documents, activeSpecialty]);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Målbeskrivelser</h1>
          <p className="text-gray-500 mt-2">Manage your goal descriptions</p>
        </div>

        <SpecialtyList 
          activeCategory="Målbeskrivelser"
          activeSpecialty={activeSpecialty}
          onSpecialtyChange={setActiveSpecialty}
        />

        <DocumentList documents={filteredDocuments} isLoading={isLoading} />
      </div>
    </Layout>
  );
};

export default Maalbeskrivelser;
