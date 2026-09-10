import { supabase } from '@/integrations/supabase/client';
import {
  KerneopgaveSectionType,
  KERNEOPGAVE_SECTION_TYPES,
} from '@/constants/kerneopgaver';

// The five subsection types live in constants so that the .docx importer can
// use them without importing the Supabase client. Re-exported here so existing
// imports of this module are unaffected.
export type { KerneopgaveSectionType } from '@/constants/kerneopgaver';
export {
  KERNEOPGAVE_SECTION_LABELS,
  KERNEOPGAVE_SECTION_TYPES,
} from '@/constants/kerneopgaver';

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

/** One subsection of an imported kerneopgave. */
export interface KerneopgaveImportSection {
  sectionType: KerneopgaveSectionType;
  /** TipTap document as a JSON string; empty for a subsection with no content. */
  draftContent: string;
}

/** One kerneopgave as the .docx importer produces it. */
export interface KerneopgaveImportItem {
  title: string;
  sections: KerneopgaveImportSection[];
}

const parseDraftContent = (value: string | undefined): any => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

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

  /**
   * Whether the current user could write kerneopgaver into a version created
   * from this document.
   *
   * This is not defensive duplication of a policy — it is a pre-flight for a
   * real gap. The kerneopgaver policies grant write access through the legacy
   * `user_permissions.can_edit` table, while `create_document_version` inherits
   * `document_access` grants only — so until the accompanying migration, a new
   * version had no `user_permissions` rows at all and only admins and the team
   * lead could write kerneopgaver into one.
   *
   * Without this check a write-level editor's import would create the version,
   * write every section, and only then be refused by RLS — leaving a
   * half-imported version behind. Checked before anything is created instead.
   */
  async canWriteKerneopgaverInNewVersion(sourceDocumentId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // user_profiles keyed by user_id, matching check_user_role and the rest of
    // the app's own admin checks.
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile?.role === 'admin') return true;

    const { data: document } = await supabase
      .from('documents')
      .select('team_lead_id')
      .eq('id', sourceDocumentId)
      .maybeSingle();

    if ((document as { team_lead_id?: string | null } | null)?.team_lead_id === user.id) {
      return true;
    }

    // The legacy row is what the kerneopgaver policies actually read, and
    // create_document_version now copies it onto the new version.
    const { data: legacy } = await supabase
      .from('user_permissions')
      .select('can_edit')
      .eq('user_id', user.id)
      .eq('document_id', sourceDocumentId)
      .eq('can_edit', true)
      .limit(1);

    return (legacy || []).length > 0;
  },

  /**
   * Bulk-create kerneopgaver and their subsections for a freshly imported
   * version. Two statements regardless of size, where the per-item path would
   * be roughly 120 round trips for the largest of the real documents.
   *
   * Returns the number of items created.
   */
  async importKerneopgaver(
    documentId: string,
    items: KerneopgaveImportItem[]
  ): Promise<number> {
    if (items.length === 0) return 0;

    // Positions are assigned here rather than read back. The target is always a
    // newly created version, which has no kerneopgaver of its own, and distinct
    // positions are what lets the inserted rows be matched back to the items
    // they came from without relying on the order the API returns them in.
    const { data: inserted, error: itemError } = await supabase
      .from('kerneopgaver')
      .insert(
        items.map((item, index) => ({
          document_id: documentId,
          title: item.title,
          position: (index + 1) * 10,
        }))
      )
      .select('id, position');

    if (itemError) throw itemError;

    const idByPosition = new Map<number, string>();
    for (const row of inserted || []) {
      idByPosition.set((row as any).position, (row as any).id);
    }

    if (idByPosition.size !== items.length) {
      throw new Error(
        `Kunne ikke oprette alle kerneopgaver (${idByPosition.size} af ${items.length}).`
      );
    }

    const now = new Date().toISOString();
    const sectionRows: Array<{
      kerneopgave_id: string;
      section_type: KerneopgaveSectionType;
      draft_content: any;
      updated_at: string;
    }> = [];

    items.forEach((item, index) => {
      const kerneopgaveId = idByPosition.get((index + 1) * 10) as string;
      const contentByType = new Map(
        item.sections.map(section => [section.sectionType, section.draftContent])
      );

      // All five rows are always created, exactly as addKerneopgave does.
      for (const sectionType of KERNEOPGAVE_SECTION_TYPES) {
        sectionRows.push({
          kerneopgave_id: kerneopgaveId,
          section_type: sectionType,
          draft_content: parseDraftContent(contentByType.get(sectionType)),
          updated_at: now,
        });
      }
    });

    const { error: sectionError } = await supabase
      .from('kerneopgave_sections')
      .insert(sectionRows);

    if (sectionError) throw sectionError;

    return items.length;
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
