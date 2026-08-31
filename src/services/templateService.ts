
import { DocumentSection } from '@/types/document';
import { supabase } from '@/integrations/supabase/client';

export interface Template {
  id: string;
  name: string;
  description: string | null;
}

export const SPECIALEBESKRIVELSER_TEMPLATE_SECTIONS = [
  { title: "1. Kort overordnet beskrivelse af specialet", content: "", order: 10 },
  { title: "2.1 Generelle opgaver", content: "", order: 20 },
  { title: "2.2 Kerneopgaver", content: "", order: 30 },
  { title: "3. Øvrige samarbejdende faggrupper", content: "", order: 40 },
  { title: "4. Forventet udvikling af teknologi og behandlingsmetoder", content: "", order: 50 },
  { title: "5. Arbejdsgruppens medlemmer", content: "", order: 60 },
  { title: "6. Anvendt materiale", content: "", order: 70 },
];

export const templateService = {
  // All templates available to build a document version on.
  getTemplates: async (): Promise<Template[]> => {
    const { data, error } = await supabase
      .from('templates')
      .select('id, name, description')
      .order('name');

    if (error) {
      console.error('Error fetching templates:', error);
      throw error;
    }

    return (data || []).map(t => ({
      id: t.id,
      name: t.name,
      description: t.description ?? null,
    }));
  },

  // Get template sections for a document category
  getTemplateSections: (category: string): Omit<DocumentSection, 'id' | 'documentId' | 'createdAt' | 'updatedAt'>[] => {
    if (category === 'Specialebeskrivelser') {
      return SPECIALEBESKRIVELSER_TEMPLATE_SECTIONS;
    }
    return [];
  },

  // Check if a document should use a template
  hasTemplate: (category: string): boolean => {
    return category === 'Specialebeskrivelser';
  }
};
