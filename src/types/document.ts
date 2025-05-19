
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
  category: 'Specialebeskrivelser' | 'Målbeskrivelser';
  sections: DocumentSection[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentCategory = 'Specialebeskrivelser' | 'Målbeskrivelser';
