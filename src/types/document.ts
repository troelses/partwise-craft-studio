
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

export type Specialty = 
  | 'Akutmedicin'
  | 'Almen medicin'
  | 'Anæstesiologi'
  | 'Arbejdsmedicin'
  | 'Børne- og ungdomspsykiatri'
  | 'Dermato-venerologi'
  | 'Gynækologi og obstetrik'
  | 'Intern medicinske specialer'
  | 'Kirurgiske specialer'
  | 'Klinisk biokemi'
  | 'Klinisk farmakologi'
  | 'Klinisk fysiologi og nuklearmedicin'
  | 'Klinisk genetik'
  | 'Klinisk immunologi'
  | 'Klinisk mikrobiologi'
  | 'Klinisk onkologi'
  | 'Neurokirurgi'
  | 'Neurologi'
  | 'Oftalmologi'
  | 'Ortopædisk kirurgi'
  | 'Oto-rhino-laryngologi'
  | 'Patologisk anatomi og cytologi'
  | 'Psykiatri'
  | 'Pædiatri'
  | 'Radiologi'
  | 'Retsmedicin'
  | 'Samfundsmedicin'
  | 'All';
