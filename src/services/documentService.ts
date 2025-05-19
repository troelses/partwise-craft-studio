
import { Document, DocumentSection } from '@/types/document';

// Mock documents data
const mockDocuments: Document[] = [
  {
    id: '1',
    title: 'Project Proposal',
    description: 'A comprehensive project proposal for the new client',
    category: 'Specialebeskrivelser',
    sections: [
      {
        id: '101',
        title: 'Executive Summary',
        content: 'This proposal outlines our approach to implementing the new system.',
        order: 1,
        documentId: '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '102',
        title: 'Project Scope',
        content: 'The project will include the following deliverables...',
        order: 2,
        documentId: '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '103',
        title: 'Timeline',
        content: 'We anticipate completing this project within 3 months...',
        order: 3,
        documentId: '1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Meeting Minutes',
    description: 'Minutes from the weekly team meeting',
    category: 'Målbeskrivelser',
    sections: [
      {
        id: '201',
        title: 'Attendees',
        content: 'John Doe, Jane Smith, Robert Johnson',
        order: 1,
        documentId: '2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '202',
        title: 'Agenda Items',
        content: '1. Project updates\n2. Budget review\n3. Next steps',
        order: 2,
        documentId: '2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

// Generate a simple ID
const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// Mock API functions
export const documentService = {
  // Get all documents
  getDocuments: async (): Promise<Document[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(mockDocuments);
      }, 500);
    });
  },

  // Get documents by category
  getDocumentsByCategory: async (category: string): Promise<Document[]> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const filteredDocs = mockDocuments.filter(doc => doc.category === category);
        resolve(filteredDocs);
      }, 500);
    });
  },

  // Get a single document
  getDocument: async (id: string): Promise<Document | undefined> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const document = mockDocuments.find(doc => doc.id === id);
        resolve(document);
      }, 300);
    });
  },

  // Create a new document
  createDocument: async (document: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Document> => {
    const newDocument: Document = {
      ...document,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve) => {
      setTimeout(() => {
        mockDocuments.push(newDocument);
        resolve(newDocument);
      }, 500);
    });
  },

  // Update a document
  updateDocument: async (document: Document): Promise<Document> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const index = mockDocuments.findIndex(doc => doc.id === document.id);
        if (index !== -1) {
          mockDocuments[index] = {
            ...document,
            updatedAt: new Date().toISOString()
          };
        }
        resolve(mockDocuments[index]);
      }, 500);
    });
  },

  // Delete a document
  deleteDocument: async (id: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const index = mockDocuments.findIndex(doc => doc.id === id);
        if (index !== -1) {
          mockDocuments.splice(index, 1);
          resolve(true);
        } else {
          resolve(false);
        }
      }, 500);
    });
  },

  // Add a section to a document
  addSection: async (documentId: string, section: Omit<DocumentSection, 'id' | 'documentId' | 'createdAt' | 'updatedAt'>): Promise<DocumentSection> => {
    const newSection: DocumentSection = {
      ...section,
      id: generateId(),
      documentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve) => {
      setTimeout(() => {
        const docIndex = mockDocuments.findIndex(doc => doc.id === documentId);
        if (docIndex !== -1) {
          mockDocuments[docIndex].sections.push(newSection);
        }
        resolve(newSection);
      }, 300);
    });
  },

  // Update a section
  updateSection: async (section: DocumentSection): Promise<DocumentSection> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const docIndex = mockDocuments.findIndex(doc => doc.id === section.documentId);
        if (docIndex !== -1) {
          const sectionIndex = mockDocuments[docIndex].sections.findIndex(s => s.id === section.id);
          if (sectionIndex !== -1) {
            mockDocuments[docIndex].sections[sectionIndex] = {
              ...section,
              updatedAt: new Date().toISOString()
            };
          }
        }
        resolve(section);
      }, 300);
    });
  },

  // Delete a section
  deleteSection: async (documentId: string, sectionId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const docIndex = mockDocuments.findIndex(doc => doc.id === documentId);
        if (docIndex !== -1) {
          mockDocuments[docIndex].sections = mockDocuments[docIndex].sections.filter(s => s.id !== sectionId);
          resolve(true);
        } else {
          resolve(false);
        }
      }, 300);
    });
  }
};
