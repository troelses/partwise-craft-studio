import { supabase } from '@/integrations/supabase/client';

export type KerneopgaveSectionType =
  | 'almenmedicinske_tilbud'
  | 'speciallaegepraksis'
  | 'sygehus'
  | 'faellesopgaver'
  | 'fremtidig_varetagelse';

export const KERNEOPGAVE_SECTION_LABELS: Record<KerneopgaveSectionType, string> = {
  almenmedicinske_tilbud: 'Almenmedicinske tilbud',
  speciallaegepraksis:    'Speciallægepraksis',
  sygehus:                'Sygehus',
  faellesopgaver:         'Fællesopgaver med andre specialer',
  fremtidig_varetagelse:  'Fremtidig varetagelse',
};

export const KERNEOPGAVE_SECTION_TYPES: KerneopgaveSectionType[] = [
  'almenmedicinske_tilbud',
  'speciallaegepraksis',
  'sygehus',
  'faellesopgaver',
  'fremtidig_varetagelse',
];

export interface KerneopgaveSection {
  id: string;
  kerneopgaveId: string;
  sectionType: KerneopgaveSectionType;
  draftContent: string;
  updatedAt: string;
}

export interface Kerneopgave {
  id: string;
  documentId: string;
  title: string;
  position: number;
  sections: KerneopgaveSection[];
  createdAt: string;
  updatedAt: string;
}

export const kerneopgaverService = {
  async getKerneopgaver(documentId: string): Promise<Kerneopgave[]> {
    const { data, error } = await supabase
      .from('kerneopgaver')
      .select(`*, kerneopgave_sections (*)`)
      .eq('document_id', documentId)
      .order('position');

    if (error) throw error;

    return (data || []).map((k: any) => ({
      id: k.id,
      documentId: k.document_id,
      title: k.title,
      position: k.position,
      createdAt: k.created_at,
      updatedAt: k.updated_at,
      sections: (k.kerneopgave_sections || []).map((s: any) => ({
        id: s.id,
        kerneopgaveId: s.kerneopgave_id,
        sectionType: s.section_type as KerneopgaveSectionType,
        draftContent: s.draft_content ? JSON.stringify(s.draft_content) : '',
        updatedAt: s.updated_at,
      })),
    }));
  },

  async addKerneopgave(documentId: string, title: string): Promise<Kerneopgave> {
    const { data: existing } = await supabase
      .from('kerneopgaver')
      .select('position')
      .eq('document_id', documentId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition = existing && existing.length > 0 ? (existing[0] as any).position + 10 : 10;

    const { data: k, error: kErr } = await supabase
      .from('kerneopgaver')
      .insert({ document_id: documentId, title, position: nextPosition })
      .select()
      .single();

    if (kErr) throw kErr;

    const { error: sErr } = await supabase
      .from('kerneopgave_sections')
      .insert(
        KERNEOPGAVE_SECTION_TYPES.map(section_type => ({
          kerneopgave_id: (k as any).id,
          section_type,
        }))
      );

    if (sErr) throw sErr;

    return {
      id: (k as any).id,
      documentId: (k as any).document_id,
      title: (k as any).title,
      position: (k as any).position,
      createdAt: (k as any).created_at,
      updatedAt: (k as any).updated_at,
      sections: KERNEOPGAVE_SECTION_TYPES.map(sectionType => ({
        id: '',
        kerneopgaveId: (k as any).id,
        sectionType,
        draftContent: '',
        updatedAt: new Date().toISOString(),
      })),
    };
  },

  async updateKerneopgaveTitle(id: string, title: string): Promise<void> {
    const { error } = await supabase
      .from('kerneopgaver')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteKerneopgave(id: string): Promise<void> {
    const { error } = await supabase
      .from('kerneopgaver')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async updateKerneopgaveSection(sectionId: string, draftContent: string): Promise<void> {
    let parsed: any = null;
    try { parsed = draftContent ? JSON.parse(draftContent) : null; } catch { /* leave null */ }

    const { error } = await supabase
      .from('kerneopgave_sections')
      .update({ draft_content: parsed, updated_at: new Date().toISOString() })
      .eq('id', sectionId);

    if (error) throw error;
  },
};
