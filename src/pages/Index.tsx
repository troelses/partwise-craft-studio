
import React, { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import DocumentList from '@/components/DocumentList';
import SpecialtyList from '@/components/SpecialtyList';
import { Button } from '@/components/ui/button';
import { Document, DocumentCategory, Specialty } from '@/types/document';
import { PlusCircle, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<DocumentCategory>('Specialebeskrivelser');
  const [activeSpecialty, setActiveSpecialty] = useState<Specialty>('All');
  const { toast } = useToast();

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('training_documents')
          .select('*');

        if (error) {
          throw error;
        }

        // Transform Supabase data to match Document type
        const transformedDocs: Document[] = data.map(doc => ({
          id: doc.id.toString(),
          title: doc.title,
          description: doc.introduction || '',
          category: 'Specialebeskrivelser', // Default category, adjust as needed
          specialty: doc.specialty,
          sections: [], // We're not fetching sections in this query
          createdAt: doc.created_at,
          updatedAt: doc.updated_at || doc.created_at,
        }));

        setDocuments(transformedDocs);
      } catch (error) {
        console.error('Failed to fetch documents:', error);
        toast({
          title: "Error",
          description: "Failed to fetch documents",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDocuments();
  }, [toast]);

  // Filter documents based on search query, active category, and specialty
  const filteredDocuments = documents.filter(doc => 
    (activeCategory === 'All' || doc.category === activeCategory) &&
    (activeSpecialty === 'All' || doc.specialty === activeSpecialty) &&
    (doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
     doc.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
            <div>
              <h1 className="text-3xl font-bold text-document-blue">Documents</h1>
              <p className="text-gray-600 mt-1">Manage your structured documents</p>
            </div>
            <div className="flex space-x-4 w-full md:w-auto">
              <div className="relative flex-grow md:flex-grow-0 md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents" 
                  className="pl-9"
                />
              </div>
              <Link to="/documents/new">
                <Button className="bg-document-blue hover:bg-blue-800">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </Link>
            </div>
          </div>
          
          <Tabs defaultValue="Specialebeskrivelser" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger 
                value="Specialebeskrivelser" 
                onClick={() => setActiveCategory('Specialebeskrivelser')}
              >
                Specialebeskrivelser
              </TabsTrigger>
              <TabsTrigger 
                value="Målbeskrivelser" 
                onClick={() => setActiveCategory('Målbeskrivelser')}
              >
                Målbeskrivelser
              </TabsTrigger>
            </TabsList>
            
            <SpecialtyList 
              activeCategory={activeCategory} 
              activeSpecialty={activeSpecialty} 
              onSpecialtyChange={setActiveSpecialty}
            />
            
            <TabsContent value="Specialebeskrivelser">
              <DocumentList 
                documents={filteredDocuments} 
                isLoading={isLoading} 
              />
            </TabsContent>
            
            <TabsContent value="Målbeskrivelser">
              <DocumentList 
                documents={filteredDocuments} 
                isLoading={isLoading} 
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default Index;
