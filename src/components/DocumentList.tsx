
import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock } from 'lucide-react';
import { Document } from '@/types/document';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DocumentListProps {
  documents: Document[];
  isLoading: boolean;
}

const DocumentList: React.FC<DocumentListProps> = ({ documents, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
            </CardHeader>
            <CardContent>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }).format(date);
  };

  const getCategoryColorClass = (category: string) => {
    switch(category) {
      case 'Specialebeskrivelser':
        return 'bg-blue-100 text-blue-800';
      case 'Målbeskrivelser':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getSpecialtyColorClass = () => {
    return 'bg-purple-100 text-purple-800';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in flex-1">
      {documents.map((doc) => (
        <Link to={`/documents/${doc.id}`} key={doc.id}>
          <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center text-lg">
                <FileText className="h-4 w-4 mr-2" />
                {doc.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500 line-clamp-2">{doc.description}</p>
              <div className="flex items-center mt-3 text-xs text-gray-400">
                <Clock className="h-3 w-3 mr-1" />
                <span>Updated {formatDate(doc.updatedAt)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColorClass(doc.category)}`}>
                  {doc.category}
                </span>
                {doc.specialty && doc.specialty !== 'All' && (
                  <span className={`text-xs px-2 py-1 rounded-full ${getSpecialtyColorClass()}`}>
                    {doc.specialty}
                  </span>
                )}
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  {doc.sections.length} section{doc.sections.length !== 1 ? 's' : ''}
                </span>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
};

export default DocumentList;
