export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  order: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  title: string;
  description: string;
  category: DocumentCategory;
  specialty: Specialty;
  sections: DocumentSection[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentCategory = 'Specialebeskrivelser' | 'Målbeskrivelser';

// Update the Specialty type to accept any string
export type Specialty = string;
