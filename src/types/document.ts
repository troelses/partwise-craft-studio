
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
  sections: DocumentSection[];
  createdAt: string;
  updatedAt: string;
}
