
import React, { useState, useEffect } from 'react';
import { Document } from '@/types/document';
import DocumentHeader from '@/components/DocumentHeader';
import DocumentSection from '@/components/DocumentSection';
import { useDocumentSections } from '@/hooks/useDocumentSections';
import { useSectionEditor } from '@/hooks/useSectionEditor';

interface DocumentEditorProps {
  document: Document;
  onUpdate: (updatedDoc: Document) => void;
  focusSection?: string;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({ document, onUpdate, focusSection }) => {
  const [currentDocument, setCurrentDocument] = useState<Document>(document);
  const [hasFocusedSection, setHasFocusedSection] = useState(false);

  const {
    documentSections,
    setDocumentSections,
    isLoading
  } = useDocumentSections(document.id);

  const {
    editingSection,
    setEditingSection,
    isSaving,
    startEditingSection,
    cancelEditingSection,
    handleSectionChange,
    saveSection
  } = useSectionEditor(document.id, documentSections, setDocumentSections);

  // Handle focus section only once when documentSections are loaded and we haven't focused yet
  useEffect(() => {
    if (focusSection && documentSections.length > 0 && !hasFocusedSection) {
      setEditingSection(focusSection);
      setHasFocusedSection(true);
    }
  }, [focusSection, documentSections, hasFocusedSection, setEditingSection]);

  // Update current document when sections change
  useEffect(() => {
    setCurrentDocument({
      ...currentDocument,
      sections: documentSections
    });
  }, [documentSections]);

  const handleDocumentUpdate = (updatedDoc: Document) => {
    setCurrentDocument(updatedDoc);
    onUpdate(updatedDoc);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded w-1/3"></div>
        <div className="h-6 bg-gray-200 rounded w-1/2"></div>
        <div className="h-36 bg-gray-200 rounded w-full mt-6"></div>
        <div className="h-36 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  const sortedSections = [...documentSections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-4xl mx-auto">
      <DocumentHeader 
        document={currentDocument}
        onUpdate={handleDocumentUpdate}
      />

      <div className="space-y-4">
        {sortedSections.map((section) => (
          <DocumentSection
            key={section.id}
            section={section}
            isEditing={editingSection === section.id}
            onStartEdit={() => startEditingSection(section.id)}
            onCancelEdit={cancelEditingSection}
            onContentChange={(content) => handleSectionChange(section.id, content)}
            onSave={() => saveSection(section.id)}
            isSaving={isSaving}
          />
        ))}
      </div>
    </div>
  );
};

export default DocumentEditor;
