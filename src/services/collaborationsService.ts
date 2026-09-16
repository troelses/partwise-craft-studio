import { supabase } from '@/integrations/supabase/client';

/**
 * The structured half of "Fællesopgaver med andre specialer".
 *
 * The subsection's own rich text is the introduction; each collaborating
 * specialty is a row here. `specialtyId` points at the canonical `specialer`
 * list when the name is recognised and is null when it is not — the drafts name
 * 68 distinct specialties and not all of them match, so the name is the required
 * half and the key is the optional one.
 *
 * Descriptions are TipTap documents rather than plain strings: ten of them carry
 * footnotes in the real drafts, and plain text would drop those.
 */

export interface Collaboration {
  id: string;
  kerneopgaveSectionId: string;
  position: number;
  specialtyId: number | null;
  specialtyName: string;
  /** TipTap JSON as a string, empty when there is no description. */
  draftDescription: string;
  publishedDescription: string;
  isApproved: boolean;
}

export interface Speciale {
  id: number;
  name: string;
}

// `any` rather than `unknown`, matching parseDraftContent in
// kerneopgaverService: the generated types want Json here, and unknown is not
// assignable to it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parseContent = (value: string): any => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toCollaboration = (row: any): Collaboration => ({
  id: row.id,
  kerneopgaveSectionId: row.kerneopgave_section_id,
  position: row.position ?? 0,
  specialtyId: row.specialty_id ?? null,
  specialtyName: row.specialty_name ?? '',
  draftDescription: row.draft_description ? JSON.stringify(row.draft_description) : '',
  publishedDescription: row.published_description ? JSON.stringify(row.published_description) : '',
  isApproved: !!row.is_approved,
});

let specialerCache: Speciale[] | null = null;

export const collaborationsService = {
  async listForSection(kerneopgaveSectionId: string): Promise<Collaboration[]> {
    const { data, error } = await supabase
      .from('kerneopgave_collaborations')
      .select('*')
      .eq('kerneopgave_section_id', kerneopgaveSectionId)
      .order('position');

    if (error) throw error;
    return (data || []).map(toCollaboration);
  },

  /** The canonical specialty list. Small and unchanging, so it is fetched once
   *  per page load and shared between every kerneopgave on the document. */
  async listSpecialer(): Promise<Speciale[]> {
    if (specialerCache) return specialerCache;

    const { data, error } = await supabase
      .from('specialer')
      .select('id, Specialenavn')
      .order('Specialenavn');

    if (error) throw error;

    specialerCache = (data || [])
      .filter(row => !!row.Specialenavn)
      .map(row => ({ id: row.id, name: row.Specialenavn as string }));
    return specialerCache;
  },

  async add(
    kerneopgaveSectionId: string,
    specialtyName: string,
    specialtyId: number | null,
    position: number
  ): Promise<Collaboration> {
    const { data, error } = await supabase
      .from('kerneopgave_collaborations')
      .insert({
        kerneopgave_section_id: kerneopgaveSectionId,
        specialty_name: specialtyName,
        specialty_id: specialtyId,
        position,
      })
      .select()
      .single();

    if (error) throw error;
    return toCollaboration(data);
  },

  /** Editing clears the approval, exactly as editing a section or a subsection
   *  does. An edited item must come back for review rather than keep reading as
   *  approved while its published text is the older version. */
  async updateDescription(id: string, draftDescription: string): Promise<void> {
    const { error } = await supabase
      .from('kerneopgave_collaborations')
      .update({
        draft_description: parseContent(draftDescription),
        is_approved: false,
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },

  async updateSpecialty(
    id: string,
    specialtyName: string,
    specialtyId: number | null
  ): Promise<void> {
    const { error } = await supabase
      .from('kerneopgave_collaborations')
      .update({
        specialty_name: specialtyName,
        specialty_id: specialtyId,
        is_approved: false,
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('kerneopgave_collaborations')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /** Rewrite the ordering after a move. Positions are renumbered from 10 in
   *  steps of 10 so a later insert between two rows does not need a rewrite. */
  async reorder(ids: string[]): Promise<void> {
    for (let index = 0; index < ids.length; index++) {
      const { error } = await supabase
        .from('kerneopgave_collaborations')
        .update({ position: (index + 1) * 10, updated_at: new Date().toISOString() })
        .eq('id', ids[index]);

      if (error) throw error;
    }
  },
};
