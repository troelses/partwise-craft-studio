
import { DocumentSection } from '@/types/document';

export const SPECIALEBESKRIVELSER_TEMPLATE_SECTIONS = [
  {
    title: "Specialearbejdsgruppes medlemmer",
    content: "",
    order: 1
  },
  {
    title: "1. Kort overordnet beskrivelse af specialet",
    content: "",
    order: 2
  },
  {
    title: "2. Kerneopgaver",
    content: "",
    order: 3
  },
  {
    title: "2.1 Praksissektor",
    content: "",
    order: 4
  },
  {
    title: "2.1.1 Almen praksis",
    content: "",
    order: 5
  },
  {
    title: "2.1.2 Speciallægepraksis",
    content: "",
    order: 6
  },
  {
    title: "2.2 Sygehus",
    content: "",
    order: 7
  },
  {
    title: "3. Samarbejde med andre specialer såvel i som udenfor sygehuse",
    content: "",
    order: 8
  },
  {
    title: "4. Den nuværende varetagelse i kommunerne",
    content: "",
    order: 9
  },
  {
    title: "5. Fremtid",
    content: "",
    order: 10
  },
  {
    title: "5.1 Teknologisk udvikling og behandlingsmetoder",
    content: "",
    order: 11
  },
  {
    title: "5.2 Fremtidige kerneopgaver i praksissektoren og på sygehuse",
    content: "",
    order: 12
  }
];

export const templateService = {
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
