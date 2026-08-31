
import React, { useState, useEffect } from 'react';
import { Document } from '@/types/document';
import DocumentHeader from './DocumentHeader';
import DocumentSection from './DocumentSection';
import KerneopgaverSection from './KerneopgaverSection';
import { useDocumentSections } from './hooks/useDocumentSections';
import { useSectionEditor } from './hooks/useSectionEditor';
import { KERNEOPGAVER_SECTION_KEY } from '@/constants/template';

interface DocumentEditorProps {
  document: Document;
  onUpdate: (updatedDoc: Document) => void;
  focusSection?: string;
  preserveScroll?: boolean;
}

const DocumentEditor: React.FC<DocumentEditorProps> = ({
  document,
  onUpdate,
  focusSection,
  preserveScroll = false,
}) => {
  const [currentDocument, setCurrentDocument] = useState<Document>(document);
  const [hasFocusedSection, setHasFocusedSection] = useState(false);

  const { documentSections, setDocumentSections, isLoading } =
    useDocumentSections(document.id);

  const {
    editingSection,
    setEditingSection,
    isSaving,
    startEditingSection,
    cancelEditingSection,
    handleSectionChange,
    saveSection,
  } = useSectionEditor(document.id, documentSections, setDocumentSections);

  useEffect(() => {
    if (focusSection && documentSections.length > 0 && !hasFocusedSection) {
      setEditingSection(focusSection);
      setHasFocusedSection(true);

      if (preserveScroll) {
        const timer = setTimeout(() => {
          const el = window.document.getElementById(`section-${focusSection}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            const saved = sessionStorage.getItem(`scroll-position-${document.id}`);
            if (saved) {
              window.scrollTo(0, parseInt(saved, 10));
              sessionStorage.removeItem(`scroll-position-${document.id}`);
            }
          }
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [focusSection, documentSections, hasFocusedSection, setEditingSection, preserveScroll, document.id]);

  useEffect(() => {
    setCurrentDocument(prev => ({ ...prev, sections: documentSections }));
  }, [documentSections]);

  const handleDocumentUpdate = (updatedDoc: Document) => {
    setCurrentDocument(updatedDoc);
    onUpdate(updatedDoc);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-12 bg-gray-200 rounded w-1/3" />
        <div className="h-6 bg-gray-200 rounded w-1/2" />
        <div className="h-36 bg-gray-200 rounded w-full mt-6" />
        <div className="h-36 bg-gray-200 rounded w-full" />
      </div>
    );
  }

  const sortedSections = [...documentSections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-4xl mx-auto">
      <DocumentHeader document={currentDocument} onUpdate={handleDocumentUpdate} />

      <div className="space-y-4">
        {sortedSections.map(section => {
          const isKerneopgaver =
            (section as any).templateSection?.section_key === KERNEOPGAVER_SECTION_KEY;

          return (
            <div key={section.id} id={`section-${section.id}`}>
              {isKerneopgaver ? (
                <KerneopgaverSection
                  documentId={document.id}
                  overviewContent={section.content}
                  isEditingOverview={editingSection === section.id}
                  onStartEditOverview={() => startEditingSection(section.id)}
                  onCancelEditOverview={cancelEditingSection}
                  onOverviewChange={content => handleSectionChange(section.id, content)}
                  onSaveOverview={() => saveSection(section.id)}
                  isSaving={isSaving}
                />
              ) : (
                <DocumentSection
                  section={section}
                  isEditing={editingSection === section.id}
                  onStartEdit={() => startEditingSection(section.id)}
                  onCancelEdit={cancelEditingSection}
                  onContentChange={content => handleSectionChange(section.id, content)}
                  onSave={() => saveSection(section.id)}
                  isSaving={isSaving}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DocumentEditor;
