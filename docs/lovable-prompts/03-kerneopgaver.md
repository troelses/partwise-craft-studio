# Prompt 3 — Dynamic kerneopgaver

Requires prompts 1 and 2, and the `20260831120000` migration (already applied).

In the new template, section **"2.2 Kerneopgaver"** is not a single rich-text
block. It opens with an overview, then carries a list of individual kerneopgaver,
each with the same five fixed sub-sections. That section is tagged in the
database with `template_sections.section_key = 'kerneopgaver'`, and the editor
renders it with a dedicated component instead of the normal one.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- Do not touch the MCP integration, `query-documents`, or `document_access` logic.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


---

## 1. Create `src/services/kerneopgaverService.ts`

New file, exactly:

```ts
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
```

## 2. Create `src/components/DocumentEditor/KerneopgaveItem.tsx`

New file, exactly:

```tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Save, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Kerneopgave,
  KerneopgaveSectionType,
  KERNEOPGAVE_SECTION_LABELS,
  KERNEOPGAVE_SECTION_TYPES,
  kerneopgaverService,
} from '@/services/kerneopgaverService';
import RichTextEditor from '@/components/RichTextEditor';
import { renderRichText } from '@/utils/richTextRenderer';

interface KerneopgaveItemProps {
  kerneopgave: Kerneopgave;
  onDelete: () => void;
  onUpdate: () => Promise<void>;
}

const KerneopgaveItem: React.FC<KerneopgaveItemProps> = ({ kerneopgave, onDelete, onUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingSection, setEditingSection] = useState<KerneopgaveSectionType | null>(null);
  const [pendingContent, setPendingContent] = useState<Partial<Record<KerneopgaveSectionType, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const getSectionContent = (type: KerneopgaveSectionType): string => {
    if (pendingContent[type] !== undefined) return pendingContent[type]!;
    return kerneopgave.sections.find(s => s.sectionType === type)?.draftContent ?? '';
  };

  const getSectionId = (type: KerneopgaveSectionType): string =>
    kerneopgave.sections.find(s => s.sectionType === type)?.id ?? '';

  const handleSave = async (type: KerneopgaveSectionType) => {
    const id = getSectionId(type);
    if (!id) return;
    setIsSaving(true);
    try {
      await kerneopgaverService.updateKerneopgaveSection(id, getSectionContent(type));
      setPendingContent(prev => { const next = { ...prev }; delete next[type]; return next; });
      setEditingSection(null);
      await onUpdate();
      toast({ title: 'Gemt' });
    } catch {
      toast({ title: 'Fejl', description: 'Kunne ikke gemme', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = (type: KerneopgaveSectionType) => {
    setPendingContent(prev => { const next = { ...prev }; delete next[type]; return next; });
    setEditingSection(null);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer select-none"
        onClick={() => setIsExpanded(v => !v)}
      >
        <div className="flex items-center space-x-2">
          {isExpanded
            ? <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
            : <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />}
          <span className="font-medium text-gray-800">{kerneopgave.title}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-red-500 flex-shrink-0"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Slet kerneopgave"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="divide-y divide-gray-100">
          {KERNEOPGAVE_SECTION_TYPES.map(type => {
            const isEditing = editingSection === type;
            const content = getSectionContent(type);

            return (
              <div key={type} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">
                    {KERNEOPGAVE_SECTION_LABELS[type]}
                  </h4>
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingSection(type)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <RichTextEditor
                      content={content}
                      onChange={val =>
                        setPendingContent(prev => ({ ...prev, [type]: val }))
                      }
                      placeholder={`Beskriv ${KERNEOPGAVE_SECTION_LABELS[type].toLowerCase()}…`}
                    />
                    <div className="flex justify-end space-x-2">
                      <Button variant="outline" onClick={() => handleCancel(type)}>
                        Annuller
                      </Button>
                      <Button onClick={() => handleSave(type)} disabled={isSaving}>
                        {isSaving ? 'Gemmer…' : <><Save className="h-4 w-4 mr-1" />Gem</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="prose max-w-none text-sm">
                    {content
                      ? renderRichText(content)
                      : <span className="text-gray-400 italic">Intet indhold endnu</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default KerneopgaveItem;
```

## 3. Create `src/components/DocumentEditor/KerneopgaverSection.tsx`

New file, exactly:

```tsx
import React, { useState, useEffect } from 'react';
import { Plus, Save, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { kerneopgaverService, Kerneopgave } from '@/services/kerneopgaverService';
import KerneopgaveItem from './KerneopgaveItem';
import RichTextEditor from '@/components/RichTextEditor';
import { renderRichText } from '@/utils/richTextRenderer';

interface KerneopgaverSectionProps {
  documentId: string;
  overviewContent: string;
  isEditingOverview: boolean;
  onStartEditOverview: () => void;
  onCancelEditOverview: () => void;
  onOverviewChange: (content: string) => void;
  onSaveOverview: () => void;
  isSaving: boolean;
}

const KerneopgaverSection: React.FC<KerneopgaverSectionProps> = ({
  documentId,
  overviewContent,
  isEditingOverview,
  onStartEditOverview,
  onCancelEditOverview,
  onOverviewChange,
  onSaveOverview,
  isSaving,
}) => {
  const [kerneopgaver, setKerneopgaver] = useState<Kerneopgave[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  useEffect(() => { loadKerneopgaver(); }, [documentId]);

  const loadKerneopgaver = async () => {
    try {
      setKerneopgaver(await kerneopgaverService.getKerneopgaver(documentId));
    } catch {
      toast({ title: 'Fejl', description: 'Kunne ikke hente kerneopgaver', variant: 'destructive' });
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    setIsAdding(true);
    try {
      await kerneopgaverService.addKerneopgave(documentId, newTitle.trim());
      setNewTitle('');
      setIsAddingNew(false);
      await loadKerneopgaver();
      toast({ title: 'Kerneopgave tilføjet' });
    } catch {
      toast({ title: 'Fejl', description: 'Kunne ikke tilføje kerneopgave', variant: 'destructive' });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await kerneopgaverService.deleteKerneopgave(id);
      setKerneopgaver(prev => prev.filter(k => k.id !== id));
      toast({ title: 'Kerneopgave slettet' });
    } catch {
      toast({ title: 'Fejl', description: 'Kunne ikke slette kerneopgave', variant: 'destructive' });
    }
  };

  return (
    <div className="document-section bg-white p-6 rounded-lg shadow-sm space-y-6">
      <h3 className="text-lg font-medium">2.2 Kerneopgaver</h3>

      {/* Overview / intro text */}
      <div>
        <div className="text-sm font-semibold text-gray-600 mb-2">Oversigt</div>
        {isEditingOverview ? (
          <div className="space-y-3">
            <RichTextEditor
              content={overviewContent}
              onChange={onOverviewChange}
              placeholder="Introduktionstekst til kerneopgaverne…"
            />
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onCancelEditOverview}>Annuller</Button>
              <Button onClick={onSaveOverview} disabled={isSaving}>
                {isSaving ? 'Gemmer…' : <><Save className="h-4 w-4 mr-1" />Gem</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-start">
            <div className="flex-1 prose max-w-none">
              {overviewContent
                ? renderRichText(overviewContent)
                : <span className="text-gray-400 italic">Ingen oversigtstekst – klik Rediger for at tilføje</span>}
            </div>
            <Button variant="ghost" size="icon" onClick={onStartEditOverview}>
              <Edit2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Kerneopgave items */}
      {kerneopgaver.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-gray-600">Kerneopgaver</div>
          {kerneopgaver.map(k => (
            <KerneopgaveItem
              key={k.id}
              kerneopgave={k}
              onDelete={() => handleDelete(k.id)}
              onUpdate={loadKerneopgaver}
            />
          ))}
        </div>
      )}

      {/* Add new */}
      <div>
        {isAddingNew ? (
          <div className="flex space-x-2 items-center">
            <Input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Navn på kerneopgave, fx 'Angstlidelser'"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setIsAddingNew(false); setNewTitle(''); }
              }}
            />
            <Button onClick={handleAdd} disabled={isAdding || !newTitle.trim()}>
              {isAdding ? 'Tilføjer…' : 'Tilføj'}
            </Button>
            <Button variant="outline" onClick={() => { setIsAddingNew(false); setNewTitle(''); }}>
              Annuller
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setIsAddingNew(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Tilføj kerneopgave
          </Button>
        )}
      </div>
    </div>
  );
};

export default KerneopgaverSection;
```

## 4. Route the kerneopgaver section in `src/components/DocumentEditor/index.tsx`

**a. Add imports** after the `DocumentSection` import:

```ts
import KerneopgaverSection from './KerneopgaverSection';
import { KERNEOPGAVER_SECTION_KEY } from '@/constants/template';
```

**b.** Find the section list:

```tsx
        {sortedSections.map((section) => (
          <div key={section.id} id={`section-${section.id}`}>
            <DocumentSection
              section={section}
              isEditing={editingSection === section.id}
              onStartEdit={() => startEditingSection(section.id)}
              onCancelEdit={cancelEditingSection}
              onContentChange={(content) => handleSectionChange(section.id, content)}
              onSave={() => saveSection(section.id)}
              isSaving={isSaving}
            />
          </div>
        ))}
```

Replace with:

```tsx
        {sortedSections.map((section) => (
          <div key={section.id} id={`section-${section.id}`}>
            {section.templateSection?.section_key === KERNEOPGAVER_SECTION_KEY ? (
              <KerneopgaverSection
                section={section}
                documentId={currentDocument.id}
                isEditing={editingSection === section.id}
                onStartEdit={() => startEditingSection(section.id)}
                onCancelEdit={cancelEditingSection}
                onContentChange={(content) => handleSectionChange(section.id, content)}
                onSave={() => saveSection(section.id)}
                isSaving={isSaving}
              />
            ) : (
              <DocumentSection
                section={section}
                isEditing={editingSection === section.id}
                onStartEdit={() => startEditingSection(section.id)}
                onCancelEdit={cancelEditingSection}
                onContentChange={(content) => handleSectionChange(section.id, content)}
                onSave={() => saveSection(section.id)}
                isSaving={isSaving}
              />
            )}
          </div>
        ))}
```

Every other section keeps rendering through `DocumentSection` exactly as before.
