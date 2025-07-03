
import React, { useState } from 'react';
import { Save, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RichTextEditor from '@/components/RichTextEditor';
import { renderRichText } from '@/utils/richTextRenderer';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TemplateSection {
  id: string;
  name: string;
  position: number;
  level: number;
  description?: string;
}

interface DocumentSectionWithTemplate {
  id: string;
  title: string;
  content: string;
  order: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  templateSection?: TemplateSection;
}

interface DocumentSectionProps {
  section: DocumentSectionWithTemplate;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onContentChange: (content: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

const DocumentSection: React.FC<DocumentSectionProps> = ({
  section,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onContentChange,
  onSave,
  isSaving
}) => {
  if (isEditing) {
    return (
      <div className="document-section bg-white p-6 rounded-lg shadow-sm">
        <div className="space-y-3">
          <div>
            <label htmlFor={`section-content-${section.id}`} className="block text-sm font-medium mb-1">
              Content for: {section.title}
            </label>
            {section.templateSection?.description && (
              <p className="text-sm text-gray-600 mb-3 italic">
                {section.templateSection.description}
              </p>
            )}
            <RichTextEditor
              content={section.content}
              onChange={onContentChange}
              placeholder={`Enter content for ${section.title}...`}
            />
          </div>
          <div className="flex space-x-2 justify-end">
            <Button 
              variant="outline" 
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
            <Button 
              onClick={onSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : <><Save className="h-4 w-4 mr-1" /> Save</>}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="document-section bg-white p-6 rounded-lg shadow-sm">
      <div>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-lg font-medium mb-2">{section.title}</h3>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onStartEdit}
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2">
          {section.content ? (
            <div className="prose max-w-none">
              {renderRichText(section.content)}
            </div>
          ) : (
            <span className="text-gray-400 italic">No content - click edit to add content</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentSection;
