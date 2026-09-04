# Prompt 15 — .docx import, part 2: the dialog and the write path

Requires prompts 9–14 **and the migration in section 1 below, applied first**.
This is the half that writes. It adds the "Importér fra Word" button, the
three-step import dialog, and the bulk write for kerneopgaver.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not regenerate RLS or switch any client to the `service_role` key.
- `published_content` is never written here. Publishing stays behind `approve_section`.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.

---

## Why the migration comes first

Building this uncovered a defect that predates it. **Kerneopgaver write access is
gated on the legacy `user_permissions.can_edit` table, not on `document_access`**,
and `create_document_version` inherits `document_access` grants only — so a new
version had no `user_permissions` rows at all. Measured on a PostgreSQL 16
harness running the real policies from `20260831120000` and the real function
from `20260902090000`, as a plain write-level editor:

| Step | Before the migration |
|---|---|
| `create_document_version(...)` | succeeds |
| write `document_sections` into the new version | succeeds |
| write `kerneopgaver` into the new version | **refused by RLS** |
| the same write as the team lead | succeeds |

That is the worst possible ordering: the version is created and every section
written before the refusal lands, leaving a half-imported version. The "New
version" button has the same hole today; the importer just makes it reachable.

The migration copies the legacy rows exactly as the function already copies
`document_access` grants. Verified on the harness: after it, the write-level
editor succeeds and the new version carries the inherited row — and an editor
who never held `can_edit` on the source is **still refused**, which is what
proves it inherits rather than grants.

## 1. Run this migration in the Supabase SQL editor first

```sql
-- Inherit legacy per-document permissions when a version is created.
--
-- Verified on a PostgreSQL 16 harness carrying the real policies from
-- 20260831120000 and the real function from 20260902090000. Before this change
-- a plain write-level editor could create a version and write its sections, but
-- inserting a kerneopgave into it was refused by row-level security, because
-- kerneopgaver are gated on user_permissions.can_edit and a new version had no
-- user_permissions rows at all. Only admins and the document's team lead could
-- complete the write.
--
-- Purely additive and idempotent: the function is replaced, no policy is
-- touched, and no user gains access to any document they could not already
-- edit. Re-running it is safe.

CREATE OR REPLACE FUNCTION public.create_document_version(
  p_source_document_id uuid,
  p_template_id        uuid,
  p_copy_content       boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source        public.documents%ROWTYPE;
  v_group         uuid;
  v_next          integer;
  v_new_id        uuid;
  v_same_template boolean;
  v_k             public.kerneopgaver%ROWTYPE;
  v_new_k_id      uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source FROM public.documents WHERE id = p_source_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source document % not found', p_source_document_id;
  END IF;

  v_group := v_source.version_group_id;

  IF NOT public.can_manage_document_versions(auth.uid(), v_group) THEN
    RAISE EXCEPTION 'Insufficient permissions to create a version of this document';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE id = p_template_id) THEN
    RAISE EXCEPTION 'Template % not found', p_template_id;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next
    FROM public.documents
   WHERE version_group_id = v_group;

  INSERT INTO public.documents (
    title, template_id, owner_id, team_lead_id,
    version_group_id, version_number, is_current,
    created_at, updated_at
  )
  VALUES (
    v_source.title, p_template_id, auth.uid(), v_source.team_lead_id,
    v_group, v_next, false,
    now(), now()
  )
  RETURNING id INTO v_new_id;

  -- Inherit the source version's grants. This also overwrites the 'approve'
  -- that on_document_created just handed the creator, pinning them to the level
  -- they actually hold on the source, so creating a version grants no authority.
  INSERT INTO public.document_access (document_id, user_id, permission, granted_by)
  SELECT v_new_id, da.user_id, da.permission, auth.uid()
    FROM public.document_access da
   WHERE da.document_id = p_source_document_id
  ON CONFLICT (document_id, user_id)
  DO UPDATE SET permission = EXCLUDED.permission,
                updated_at = now();

  -- Inherit the legacy user_permissions rows as well.
  --
  -- This is not belt-and-braces: the kerneopgaver policies still grant write
  -- access through user_permissions.can_edit and know nothing about
  -- document_access. Copying document_access alone therefore produced a version
  -- whose sections a write-level editor could fill in but whose kerneopgaver
  -- they could not, failing with an RLS error only after every section had
  -- already been written.
  --
  -- Rows are copied verbatim, section_id included. Those policies ignore
  -- section_id, so copying it reproduces exactly the access the user held on the
  -- source version -- nothing is widened, and a user with no row on the source
  -- still gets none here.
  INSERT INTO public.user_permissions (
    user_id, document_id, section_id, can_view, can_edit
  )
  SELECT up.user_id, v_new_id::text, up.section_id, up.can_view, up.can_edit
    FROM public.user_permissions up
   WHERE up.document_id = p_source_document_id::text
  ON CONFLICT (user_id, document_id, section_id) DO NOTHING;

  v_same_template := (v_source.template_id IS NOT DISTINCT FROM p_template_id);

  -- Sections are keyed by template_section_id, so content only carries across
  -- when the template is unchanged. The new version starts unpublished:
  -- published_content stays null and is_approved keeps its false default.
  IF p_copy_content AND v_same_template THEN
    INSERT INTO public.document_sections (
      document_id, template_section_id, content, draft_content, updated_at
    )
    SELECT v_new_id, ds.template_section_id, ds.content,
           COALESCE(ds.draft_content, ds.published_content), now()
      FROM public.document_sections ds
     WHERE ds.document_id = p_source_document_id;
  END IF;

  IF p_copy_content AND EXISTS (
        SELECT 1
          FROM public.template_sections ts
         WHERE ts.template_id = p_template_id
           AND ts.section_key = 'kerneopgaver'
     ) THEN
    FOR v_k IN
      SELECT * FROM public.kerneopgaver
       WHERE document_id = p_source_document_id
       ORDER BY position
    LOOP
      INSERT INTO public.kerneopgaver (document_id, title, position)
      VALUES (v_new_id, v_k.title, v_k.position)
      RETURNING id INTO v_new_k_id;

      INSERT INTO public.kerneopgave_sections (
        kerneopgave_id, section_type, draft_content, updated_at
      )
      SELECT v_new_k_id, ks.section_type, ks.draft_content, now()
        FROM public.kerneopgave_sections ks
       WHERE ks.kerneopgave_id = v_k.id;
    END LOOP;
  END IF;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_document_version(uuid, uuid, boolean) TO authenticated;
```

## 2. Create `src/utils/docxImport/blocksToDoc.ts`

The parser produces a flat block list and records list membership in `listKind`
rather than nesting, because membership is only knowable from the neighbours.
This is where that becomes the nested shape the editor and renderer expect.

```ts
import { DocxBlock } from './types';

/**
 * Turn a run of parsed .docx blocks into one TipTap document.
 *
 * The parser deliberately produces a flat list: it records that a paragraph is
 * a list item in `listKind` rather than nesting it, because list membership is
 * only knowable once the neighbouring paragraphs are known. This is where that
 * flat list becomes the nested shape the editor and the renderer expect —
 * consecutive blocks of the same list kind collapse into a single
 * `bulletList` / `orderedList`.
 *
 * Nesting beyond level 0 is deliberately not attempted: `w:ilvl` is available
 * but the app's renderer flattens nested lists anyway, so reading it would
 * promise more fidelity than the round trip can keep.
 */

type Node = Record<string, unknown>;

const listNodeType = (kind: 'bullet' | 'ordered'): string =>
  kind === 'ordered' ? 'orderedList' : 'bulletList';

export const blocksToDoc = (blocks: DocxBlock[]): Node | null => {
  const content: Node[] = [];
  let listKind: 'bullet' | 'ordered' | null = null;
  let items: Node[] = [];

  const flush = () => {
    if (listKind && items.length > 0) {
      content.push({ type: listNodeType(listKind), content: items });
    }
    listKind = null;
    items = [];
  };

  for (const block of blocks) {
    if (block.listKind) {
      if (block.listKind !== listKind) flush();
      listKind = block.listKind;
      items.push({ type: 'listItem', content: [block.node] });
      continue;
    }
    flush();
    content.push(block.node);
  }
  flush();

  // An empty section is left unwritten rather than saved as a blank document,
  // so an import never overwrites anything with nothing.
  return content.length > 0 ? { type: 'doc', content } : null;
};

/** The same thing as a JSON string, which is the form every write path in the
 *  app takes content in. Empty string for no content. */
export const blocksToJson = (blocks: DocxBlock[]): string => {
  const doc = blocksToDoc(blocks);
  return doc ? JSON.stringify(doc) : '';
};
```

## 3. `src/services/templateService.ts`

The importer matches against the chosen template's real sections, so it needs to
read them. Find this:

```ts
export interface Template {
  id: string;
  name: string;
  description: string | null;
}
```

Add immediately after it:

```ts
/** One row of template_sections, as the importer needs it. */
export interface TemplateSectionRef {
  id: string;
  name: string;
  position: number;
  sectionKey: string | null;
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

```

Then find this line:

```ts
  // Get template sections for a document category
```

Add immediately **before** it:

```ts
  // The sections of one template, in document order.
  //
  // Returned in the shape the .docx importer matches against. The type is
  // declared structurally rather than imported from the importer, so this
  // service keeps no dependency on the parser.
  getTemplateSectionRefs: async (templateId: string): Promise<TemplateSectionRef[]> => {
    const { data, error } = await supabase
      .from('template_sections')
      .select('id, name, position, section_key')
      .eq('template_id', templateId)
      .order('position');

    if (error) {
      console.error('Error fetching template sections:', error);
      throw error;
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      position: row.position,
      sectionKey: (row as { section_key?: string | null }).section_key ?? null,
    }));
  },

```

## 4. `src/services/kerneopgaverService.ts`

Find this line:

```ts
export const kerneopgaverService = {
```

Add immediately **before** it:

```ts
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

```

Then find this line:

```ts
  async updateKerneopgaveTitle(id: string, title: string): Promise<void> {
```

Add immediately **before** it:

```ts
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
   *
   * The three paths below are exactly the three write policies on kerneopgaver:
   * admin, team lead (team_lead_id is copied onto the new version), and a
   * can_edit row on the source (copied by the migration that goes with this).
   * Apply that migration before this code, or the third path reports access the
   * database will refuse.
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
   * It also avoids a trap in `addKerneopgave`, which returns `id: ''` for each
   * of the five subsections because it never selects them back. The editor gets
   * away with that by discarding the return value and re-fetching; an importer
   * writing content into those rows cannot.
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

      // All five rows are always created, exactly as addKerneopgave does. The
      // source documents use anywhere from one to five of them, and the ones
      // they omit simply stay empty so the editor still offers the field.
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

```

`importKerneopgaver` is two statements regardless of size. The per-item path
would be roughly 120 round trips for the largest document, and `addKerneopgave`
returns `id: ''` for each of its five subsections because it never selects them
back — the editor hides that by re-fetching, an importer writing content into
those rows cannot.

## 5. Create `src/components/DocumentImportDialog.tsx`

```tsx
import React, { useState } from 'react';
import { AlertTriangle, FileUp, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { documentService } from '@/services/documentService';
import { templateService, Template, TemplateSectionRef } from '@/services/templateService';
import {
  kerneopgaverService,
  KerneopgaveImportItem,
} from '@/services/kerneopgaverService';
import { previewDocxImport } from '@/utils/docxImport/parseDocx';
import { blocksToJson } from '@/utils/docxImport/blocksToDoc';
import {
  DocxBlock,
  ImportPreview,
  ParsedKerneopgave,
} from '@/utils/docxImport/types';
import { KERNEOPGAVE_SECTION_LABELS } from '@/constants/kerneopgaver';

/**
 * Import a Word specialebeskrivelse into a new version of a document.
 *
 * Three steps in one dialog: choose the template and the file, review what the
 * parser made of it, then write. Nothing touches the database before the last
 * step, and even then only `draft_content` — publishing stays behind
 * `approve_section`, so a bad import is discarded by simply never promoting the
 * version it created.
 *
 * The review step is the feature, not a safety net. Matching a Word heading to
 * a template section cannot be made reliable: the real drafts contain typo'd
 * headings, a grouping heading that looks like a kerneopgave, and headings
 * whose level lives in a character style. A human confirming the mapping is
 * part of the design.
 */

const UNASSIGNED = '__unassigned__';

interface Candidate {
  key: string;
  sourceHeading: string;
  blocks: DocxBlock[];
  kerneopgaver: ParsedKerneopgave[];
  confidence: number;
  /** template_sections.id, or UNASSIGNED. */
  target: string;
}

interface DocumentImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The version being imported from — the new version is created off it. */
  documentId: string;
  /** Template of that version, used as the default choice. */
  currentTemplateId?: string | null;
  /** Called with the new version's id once everything has been written. */
  onImported: (newDocumentId: string) => void;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const confidenceBadge = (confidence: number) => {
  if (confidence >= 0.95) return <Badge variant="secondary">Sikker</Badge>;
  if (confidence >= 0.75) return <Badge variant="outline">Sandsynlig</Badge>;
  return <Badge variant="destructive">Usikker</Badge>;
};

/** A synthetic heading block, so a title that is not going to become a
 *  kerneopgave still reads as a heading in the section it falls back into. */
const headingBlock = (text: string): DocxBlock => ({
  level: 3,
  via: null,
  text,
  node: { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] },
  listKind: null,
});

/**
 * Split one parsed kerneopgaver section into the rows to write and the blocks
 * that have to fall back into the section's own text.
 *
 * Two cases here are not defensive coding — both occur in the real drafts and
 * both silently lost content until they were measured:
 *
 * - **An item with no recognised subsections is not a kerneopgave.** In Børne-
 *   og ungdomspsykiatri, "Neuroudviklingsforstyrrelser, herunder:" is a grouping
 *   lead-in followed by the real item. Writing it as an item would need a
 *   subsection to put its text in, and inventing one misfiles the text; dropping
 *   it lost a paragraph and a footnote. Its heading and text go into the
 *   section body instead, which is what it actually is.
 *
 * - **A repeated subsection type must merge, not overwrite.** Hæmatologi and
 *   Børne each have one item whose heading was not styled as one, so the next
 *   item's subsections were absorbed and a type appears twice. Keying a map on
 *   the type silently kept only the last. They are concatenated instead, and the
 *   review screen flags the item so it can be fixed at source.
 */
const buildKerneopgavePayload = (
  kerneopgaver: ParsedKerneopgave[]
): { items: KerneopgaveImportItem[]; fallbackBlocks: DocxBlock[] } => {
  const items: KerneopgaveImportItem[] = [];
  const fallbackBlocks: DocxBlock[] = [];

  for (const item of kerneopgaver) {
    if (item.sections.length === 0) {
      fallbackBlocks.push(headingBlock(item.title), ...item.leadIn);
      continue;
    }

    const byType = new Map<string, DocxBlock[]>();
    item.sections.forEach((section, index) => {
      // Content before the first recognised subsection heading is prepended to
      // that subsection rather than dropped — there is nowhere else to put it.
      const blocks = index === 0 ? [...item.leadIn, ...section.blocks] : section.blocks;
      byType.set(section.type, [...(byType.get(section.type) ?? []), ...blocks]);
    });

    items.push({
      title: item.title,
      sections: [...byType.entries()].map(([sectionType, blocks]) => ({
        sectionType: sectionType as KerneopgaveImportItem['sections'][number]['sectionType'],
        draftContent: blocksToJson(blocks),
      })),
    });
  }

  return { items, fallbackBlocks };
};

/** Items the parser produced that will not become kerneopgaver, and items whose
 *  subsections repeat — both are shown in the review rather than resolved
 *  silently, because the reliable fix is in the Word document. */
const kerneopgaveAnomalies = (kerneopgaver: ParsedKerneopgave[]): string[] => {
  const notes: string[] = [];
  for (const item of kerneopgaver) {
    if (item.sections.length === 0) {
      notes.push(`“${item.title}” har ingen underafsnit og importeres som tekst i afsnittet, ikke som en kerneopgave.`);
      continue;
    }
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const section of item.sections) {
      if (seen.has(section.type)) repeated.add(section.type);
      seen.add(section.type);
    }
    if (repeated.size > 0) {
      notes.push(`“${item.title}” har det samme underafsnit flere gange — sandsynligvis fordi en overskrift ikke er formateret som overskrift i Word. Indholdet slås sammen.`);
    }
  }
  return notes;
};

const DocumentImportDialog: React.FC<DocumentImportDialogProps> = ({
  open,
  onOpenChange,
  documentId,
  currentTemplateId,
  onImported,
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSections, setTemplateSections] = useState<TemplateSectionRef[]>([]);
  const [templateId, setTemplateId] = useState<string>(currentTemplateId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [canWriteKerneopgaver, setCanWriteKerneopgaver] = useState(true);
  const { toast } = useToast();

  const loadTemplates = async () => {
    if (templates.length > 0) return;
    try {
      setTemplates(await templateService.getTemplates());
    } catch (error) {
      toast({
        title: 'Fejl',
        description: errorMessage(error, 'Skabelonerne kunne ikke hentes'),
        variant: 'destructive',
      });
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCandidates([]);
    setTemplateSections([]);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) reset();
    else loadTemplates();
    onOpenChange(value);
  };

  const analyse = async () => {
    if (!templateId || !file) return;
    setIsAnalysing(true);
    try {
      const sections = await templateService.getTemplateSectionRefs(templateId);
      const result = await previewDocxImport(file, sections);

      setTemplateSections(sections);
      setPreview(result);
      setCanWriteKerneopgaver(
        await kerneopgaverService.canWriteKerneopgaverInNewVersion(documentId)
      );
      setCandidates([
        ...result.sections.map((section, index) => ({
          key: `s${index}`,
          sourceHeading: section.sourceHeading,
          blocks: section.blocks,
          kerneopgaver: section.kerneopgaver,
          confidence: section.confidence,
          target: section.templateSectionId ?? UNASSIGNED,
        })),
        ...result.unassigned.map((entry, index) => ({
          key: `u${index}`,
          sourceHeading: entry.sourceHeading,
          blocks: entry.blocks,
          kerneopgaver: [],
          confidence: 0,
          target: UNASSIGNED,
        })),
      ]);
    } catch (error) {
      toast({
        title: 'Filen kunne ikke læses',
        description: errorMessage(error, 'Dokumentet kunne ikke analyseres'),
        variant: 'destructive',
      });
    } finally {
      setIsAnalysing(false);
    }
  };

  const setTarget = (key: string, target: string) =>
    setCandidates(current =>
      current.map(candidate => (candidate.key === key ? { ...candidate, target } : candidate))
    );

  const assigned = candidates.filter(candidate => candidate.target !== UNASSIGNED);

  const duplicateTargets = [
    ...new Set(
      assigned
        .map(candidate => candidate.target)
        .filter((target, index, all) => all.indexOf(target) !== index)
    ),
  ];

  const kerneopgaverSectionId =
    templateSections.find(section => section.sectionKey === 'kerneopgaver')?.id ?? null;

  // Kerneopgaver can only be written into the section the schema ties them to.
  const strandedKerneopgaver = candidates.filter(
    candidate => candidate.kerneopgaver.length > 0 && candidate.target !== kerneopgaverSectionId
  );

  const importsKerneopgaver = assigned.some(
    candidate => candidate.target === kerneopgaverSectionId && candidate.kerneopgaver.length > 0
  );

  // Refused up front rather than part-way through: sections would already have
  // been written by the time the kerneopgaver insert was refused.
  const blockedByKerneopgaverAccess = importsKerneopgaver && !canWriteKerneopgaver;

  const canImport =
    assigned.length > 0 &&
    duplicateTargets.length === 0 &&
    !blockedByKerneopgaverAccess &&
    !isWriting;

  const runImport = async () => {
    if (!templateId) return;
    setIsWriting(true);
    try {
      // copyContent: false — imported text replaces rather than augments, and
      // it keeps the new version free of kerneopgaver copied from the source.
      const newDocumentId = await documentService.createDocumentVersion(
        documentId,
        templateId,
        false
      );

      const payloads = assigned
        .filter(candidate => candidate.target === kerneopgaverSectionId)
        .map(candidate => buildKerneopgavePayload(candidate.kerneopgaver));

      const fallbackBlocks = payloads.flatMap(payload => payload.fallbackBlocks);

      for (const candidate of assigned) {
        // Anything that could not become a kerneopgave is appended to the
        // section's own text, so no parsed paragraph goes unwritten.
        const blocks =
          candidate.target === kerneopgaverSectionId
            ? [...candidate.blocks, ...fallbackBlocks]
            : candidate.blocks;
        const content = blocksToJson(blocks);
        if (!content) continue;
        await documentService.updateSection({
          id: '',
          title: candidate.sourceHeading,
          content,
          order: 0,
          documentId: newDocumentId,
          createdAt: '',
          updatedAt: '',
          templateSectionId: candidate.target,
        });
      }

      const items = payloads.flatMap(payload => payload.items);
      if (items.length > 0) {
        await kerneopgaverService.importKerneopgaver(newDocumentId, items);
      }

      toast({
        title: 'Dokumentet er importeret',
        description:
          'Indholdet ligger som udkast i en ny version. Versionen bliver først den aktuelle, når den sættes som det.',
      });
      reset();
      onOpenChange(false);
      onImported(newDocumentId);
    } catch (error) {
      toast({
        title: 'Importen mislykkedes',
        description: errorMessage(error, 'Indholdet kunne ikke skrives'),
        variant: 'destructive',
      });
    } finally {
      setIsWriting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importér fra Word</DialogTitle>
          <DialogDescription>
            Indholdet lægges i en ny version som udkast. Intet bliver publiceret,
            og den nuværende version ændres ikke.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {!preview && (
            <>
              <div className="space-y-2">
                <Label>Skabelon</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vælg den skabelon dokumentet følger" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Dokumenter med afsnittet “Intern medicin” skal bruge
                  intern medicin-skabelonen. Vælges den forkerte skabelon, vil
                  afsnittet stå som ikke tildelt i næste trin.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="docx-file">Word-fil</Label>
                <input
                  id="docx-file"
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={event => setFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm"
                />
              </div>
            </>
          )}

          {preview && (
            <>
              <div className="text-sm text-gray-600">
                {assigned.length} af {candidates.length} tekstblokke er tildelt et
                afsnit. {preview.footnoteCount} fodnote(r) fundet.
              </div>

              {preview.warnings.map((warning, index) => (
                <div
                  key={`w${index}`}
                  className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
                >
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}

              {duplicateTargets.length > 0 && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  To tekstblokke peger på det samme afsnit. Ret tildelingen, før du
                  importerer.
                </div>
              )}

              {blockedByKerneopgaverAccess && (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  Du har ikke rettigheder til at oprette kerneopgaver i en ny
                  version af dette dokument. Kun dokumentets teamleder og
                  administratorer kan det. Bed en af dem om at importere
                  dokumentet, eller få tildelt rollen først — importen er stoppet,
                  så der ikke oprettes en halvt udfyldt version.
                </div>
              )}

              {strandedKerneopgaver.length > 0 && (
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                  Kerneopgaver kan kun gemmes i kerneopgave-afsnittet. De vil ikke
                  blive importeret, så længe blokken peger et andet sted hen.
                </div>
              )}

              {candidates.map(candidate => (
                <div
                  key={candidate.key}
                  className={`rounded-md border p-3 ${
                    candidate.target === UNASSIGNED ? 'border-amber-300 bg-amber-50/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {candidate.sourceHeading || '(uden overskrift)'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {candidate.blocks.length} afsnit
                        {candidate.kerneopgaver.length > 0 &&
                          ` · ${candidate.kerneopgaver.length} kerneopgaver`}
                      </div>
                    </div>
                    {candidate.target !== UNASSIGNED && confidenceBadge(candidate.confidence)}
                  </div>

                  <div className="mt-2">
                    <Select
                      value={candidate.target}
                      onValueChange={value => setTarget(candidate.key, value)}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Ikke tildelt — importeres ikke</SelectItem>
                        {templateSections.map(section => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {candidate.kerneopgaver.length > 0 && (
                    <div className="mt-3 space-y-2 border-l-2 border-gray-200 pl-3">
                      {candidate.kerneopgaver.map((item, index) => (
                        <div key={`k${index}`} className="text-sm">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-xs text-gray-500">
                            {item.sections.length > 0
                              ? item.sections
                                  .map(section => KERNEOPGAVE_SECTION_LABELS[section.type])
                                  .join(' · ')
                              : 'Ingen underafsnit fundet'}
                          </div>
                          {item.warnings.map((warning, wIndex) => (
                            <div key={`kw${wIndex}`} className="text-xs text-amber-700">
                              {warning}
                            </div>
                          ))}
                          {kerneopgaveAnomalies([item]).map((note, aIndex) => (
                            <div key={`ka${aIndex}`} className="text-xs text-amber-700">
                              {note}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          {!preview ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Annuller
              </Button>
              <Button onClick={analyse} disabled={!templateId || !file || isAnalysing}>
                {isAnalysing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4 mr-1" />
                )}
                Analysér
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={reset} disabled={isWriting}>
                Vælg en anden fil
              </Button>
              <Button onClick={runImport} disabled={!canImport}>
                {isWriting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Importér som ny version
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentImportDialog;
```

## 6. `src/components/DocumentVersions.tsx`

Four small edits. Find:

```ts
import { Check, GitBranch, Plus, Star } from 'lucide-react';
```

Replace with:

```ts
import { Check, GitBranch, Plus, Star, Upload } from 'lucide-react';
```

Find:

```ts
import { useToast } from '@/hooks/use-toast';
```

Replace with:

```ts
import { useToast } from '@/hooks/use-toast';
import DocumentImportDialog from '@/components/DocumentImportDialog';
```

Find:

```ts
  const [isDialogOpen, setIsDialogOpen] = useState(false);
```

Replace with:

```ts
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
```

Find:

```tsx
        {canCreate && (
          <Button onClick={openDialog} className="flex items-center">
            <Plus className="h-4 w-4 mr-1" />
            New version
          </Button>
        )}
```

Replace with:

```tsx
        {canCreate && (
          <div className="flex items-center gap-2">
            {/* Importing a Word document creates a version, so it belongs here
                and is gated on the same write-level access. */}
            <Button
              variant="outline"
              onClick={() => setIsImportOpen(true)}
              className="flex items-center"
            >
              <Upload className="h-4 w-4 mr-1" />
              Importér fra Word
            </Button>
            <Button onClick={openDialog} className="flex items-center">
              <Plus className="h-4 w-4 mr-1" />
              New version
            </Button>
          </div>
        )}
```

Find:

```tsx
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-start mb-4">
```

Replace with:

```tsx
    <div className="max-w-4xl mx-auto">
      <DocumentImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        documentId={documentId}
        currentTemplateId={sourceVersion?.templateId ?? null}
        onImported={newId => navigate(`/documents/${newId}`)}
      />

      <div className="flex justify-between items-start mb-4">
```

---

## Two content-loss bugs this went through, and why the code looks as it does

Both were found by running the full parse-to-payload path over all 13 real
documents and counting blocks in against blocks written. Neither would have
raised an error; both silently lost text.

- **An item with no recognised subsections was dropped entirely.** Børne- og
  ungdomspsykiatri's *"Neuroudviklingsforstyrrelser, herunder:"* is a grouping
  lead-in, not a kerneopgave. Its lead-in text was prepended to `sections[0]` —
  which does not exist — so a paragraph and a footnote vanished. It is now
  written into the section's own text as a heading plus its paragraphs, which is
  what it actually is, and flagged in the review. Børne yields **11**
  kerneopgaver, not 12.
- **A repeated subsection type overwrote instead of merging.** Hæmatologi and
  Børne each have an item whose heading was not styled as one, so the next item's
  subsections were absorbed and a type appears twice. A `Map` keyed on the type
  kept only the last occurrence. They are concatenated now, and the item is
  flagged so it can be fixed at source — which remains the reliable fix.

After both fixes, across all 13 documents: **zero blocks lost, and footnotes in
equals footnotes out in every document** (Børne 9/9, previously 9/8).

## After applying

Typecheck with `npx tsc -p tsconfig.app.json --noEmit`. Plain
`npx tsc --noEmit` checks nothing in this repo — the root config has
`files: []`.

Then, on a document that has kerneopgaver:

1. Versions tab → **Importér fra Word**. Pick the template that matches the
   document — the Intern medicin one for those nine specialties. Picking the
   wrong one must visibly fail: `Intern medicin` should land under "ikke
   tildelt", not be silently absorbed.
2. Review the mapping. Confirm the unassigned list is empty or deliberate.
3. Import. The new version appears in the list, is **not** current, its sections
   carry the imported text, kerneopgaver appear with their subsections, and
   footnotes render with continuous numbering.
4. Confirm `published_content` is null and `is_approved` false throughout — the
   import must not publish anything.
5. Discarding a bad import is simply not promoting the version.
