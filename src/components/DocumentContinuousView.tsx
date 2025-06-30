
import React from 'react';
import { Document } from '@/types/document';
import { renderRichText } from '@/utils/richTextRenderer';

interface DocumentContinuousViewProps {
  document: Document;
}

const DocumentContinuousView: React.FC<DocumentContinuousViewProps> = ({ document }) => {
  // Sort sections by order (position from template_sections)
  const sortedSections = [...document.sections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm">
      {/* Document Title */}
      <div className="mb-8 border-b pb-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{document.title}</h1>
        <div className="text-sm text-gray-500">
          Category: {document.category} | Created: {new Date(document.createdAt).toLocaleDateString()}
        </div>
      </div>

      {/* Continuous Text Content */}
      <div className="prose prose-lg max-w-none">
        {sortedSections.map((section, index) => (
          <div key={section.id} className="mb-8">
            {/* Section Title */}
            <h2 className="text-xl font-semibold text-gray-800 mb-4 border-l-4 border-blue-500 pl-4">
              {section.title}
            </h2>
            
            {/* Section Content */}
            <div className="text-gray-700 leading-relaxed">
              {section.content ? (
                renderRichText(section.content)
              ) : (
                <span className="text-gray-400 italic">
                  [No content provided for this section]
                </span>
              )}
            </div>
            
            {/* Add spacing between sections, except for the last one */}
            {index < sortedSections.length - 1 && (
              <div className="mt-8 border-b border-gray-200"></div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
        Last updated: {new Date(document.updatedAt).toLocaleDateString()}
      </div>
    </div>
  );
};

export default DocumentContinuousView;
