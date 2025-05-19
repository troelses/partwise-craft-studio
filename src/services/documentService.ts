import { Document, DocumentCategory, Specialty } from '@/types/document';

// Mock documents with required specialty property
const mockDocuments: Document[] = [
  {
    id: '1',
    title: 'Specialebeskrivelse: Kardiologi',
    description: 'Beskrivelse af specialet kardiologi',
    category: 'Specialebeskrivelser',
    specialty: 'Intern medicinske specialer',
    sections: [
      {
        id: '1-1',
        title: 'Introduktion',
        content: 'Dette er en introduktion til kardiologi...',
        order: 1,
        documentId: '1',
        createdAt: '2023-05-01T10:30:00Z',
        updatedAt: '2023-05-01T10:30:00Z',
      },
      {
        id: '1-2',
        title: 'Project Scope',
        content: 'The project will include the following deliverables...',
        order: 2,
        documentId: '1',
        createdAt: '2023-05-01T10:30:00Z',
        updatedAt: '2023-05-01T10:30:00Z',
      },
      {
        id: '1-3',
        title: 'Timeline',
        content: 'We anticipate completing this project within 3 months...',
        order: 3,
        documentId: '1',
        createdAt: '2023-05-01T10:30:00Z',
        updatedAt: '2023-05-01T10:30:00Z',
      }
    ],
    createdAt: '2023-05-01T10:30:00Z',
    updatedAt: '2023-05-01T10:30:00Z',
  },
  {
    id: '2',
    title: 'Målbeskrivelse: Karkirurgi',
    description: 'Målbeskrivelse for karkirurgi',
    category: 'Målbeskrivelser',
    specialty: 'Kirurgiske specialer',
    sections: [
      {
        id: '2-1',
        title: 'Kompetencemål',
        content: 'Efter endt uddannelse skal lægen kunne...',
        order: 1,
        documentId: '2',
        createdAt: '2023-04-15T14:20:00Z',
        updatedAt: '2023-04-15T14:20:00Z',
      },
      {
        id: '2-2',
        title: 'Attendees',
        content: 'John Doe, Jane Smith, Robert Johnson',
        order: 2,
        documentId: '2',
        createdAt: '2023-04-15T14:20:00Z',
        updatedAt: '2023-04-15T14:20:00Z',
      },
      {
        id: '2-3',
        title: 'Agenda Items',
        content: '1. Project updates\n2. Budget review\n3. Next steps',
        order: 3,
        documentId: '2',
        createdAt: '2023-04-15T14:20:00Z',
        updatedAt: '2023-04-15T14:20:00Z',
      }
    ],
    createdAt: '2023-04-15T14:20:00Z',
    updatedAt: '2023-04-15T14:20:00Z',
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
