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
