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
