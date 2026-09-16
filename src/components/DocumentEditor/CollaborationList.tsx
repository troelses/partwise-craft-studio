import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Edit2, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import RichTextEditor from '@/components/RichTextEditor';
import { renderRichText } from '@/utils/richTextRenderer';
import {
  Collaboration,
  Speciale,
  collaborationsService,
} from '@/services/collaborationsService';

/**
 * The list of collaborating specialties under "Fællesopgaver med andre
 * specialer".
 *
 * The subsection's rich text above this is the introduction; each specialty is
 * its own row, so the same specialty can be found across documents instead of
 * being buried in prose.
 *
 * A name that is not in `specialer` is kept as free text rather than refused:
 * the drafts name 68 specialties and the canonical list may not hold all of
 * them. Unrecognised names are marked so they can be tidied later.
 */

interface CollaborationListProps {
  kerneopgaveSectionId: string;
}

interface SpecialtyPickerProps {
  value: string;
  specialer: Speciale[];
  onPick: (name: string, id: number | null) => void;
}

const SpecialtyPicker: React.FC<SpecialtyPickerProps> = ({ value, specialer, onPick }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const typed = query.trim();
  const exact = specialer.some(s => s.name.toLowerCase() === typed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between min-w-[240px]">
          <span className="truncate">{value || 'Vælg speciale…'}</span>
          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <Command shouldFilter>
          <CommandInput
            placeholder="Søg speciale…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Ingen match i specialelisten.</CommandEmpty>
            {/* Free text is allowed on purpose — see the comment above. */}
            {typed && !exact && (
              <CommandGroup heading="Fritekst">
                <CommandItem
                  value={typed}
                  onSelect={() => { onPick(typed, null); setOpen(false); setQuery(''); }}
                >
                  Brug “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Specialer">
              {specialer.map(s => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => { onPick(s.name, s.id); setOpen(false); setQuery(''); }}
                >
                  {s.name === value && <Check className="h-4 w-4 mr-2" />}
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const CollaborationList: React.FC<CollaborationListProps> = ({ kerneopgaveSectionId }) => {
  const [items, setItems] = useState<Collaboration[]>([]);
  const [specialer, setSpecialer] = useState<Speciale[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const { toast } = useToast();

  const reload = async () => {
    try {
      setItems(await collaborationsService.listForSection(kerneopgaveSectionId));
    } catch (error) {
      console.error('Error loading collaborations:', error);
      toast({ title: 'Fejl', description: 'Fællesopgaverne kunne ikke hentes', variant: 'destructive' });
    }
  };

  useEffect(() => {
    reload();
    collaborationsService
      .listSpecialer()
      .then(setSpecialer)
      // The list is a convenience: without it the picker still accepts free text.
      .catch(error => console.error('Error loading specialer:', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kerneopgaveSectionId]);

  const nextPosition = useMemo(
    () => (items.length === 0 ? 10 : Math.max(...items.map(i => i.position)) + 10),
    [items]
  );

  const guard = async (action: () => Promise<unknown>, failure: string) => {
    setIsBusy(true);
    try {
      await action();
      await reload();
    } catch (error) {
      console.error(failure, error);
      toast({ title: 'Fejl', description: failure, variant: 'destructive' });
    } finally {
      setIsBusy(false);
    }
  };

  const addItem = () =>
    guard(
      () => collaborationsService.add(kerneopgaveSectionId, 'Nyt speciale', null, nextPosition),
      'Specialet kunne ikke tilføjes'
    );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const order = items.map(i => i.id);
    [order[index], order[target]] = [order[target], order[index]];
    return guard(() => collaborationsService.reorder(order), 'Rækkefølgen kunne ikke gemmes');
  };

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <h6 className="text-sm font-semibold">Samarbejdende specialer</h6>
        <Button variant="outline" size="sm" onClick={addItem} disabled={isBusy}>
          <Plus className="h-4 w-4 mr-1" />
          Tilføj speciale
        </Button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">Ingen specialer tilføjet endnu.</p>
      )}

      <div className="space-y-4">
        {items.map((item, index) => {
          const isEditing = editingId === item.id;

          return (
            <div key={item.id} className="border rounded-md p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <SpecialtyPicker
                    value={item.specialtyName}
                    specialer={specialer}
                    onPick={(name, id) =>
                      guard(
                        () => collaborationsService.updateSpecialty(item.id, name, id),
                        'Specialet kunne ikke gemmes'
                      )
                    }
                  />
                  {item.specialtyId === null && (
                    <Badge variant="secondary">fritekst</Badge>
                  )}
                </div>

                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isBusy}
                    onClick={() => move(index, -1)}
                    title="Flyt op"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isBusy}
                    onClick={() => move(index, 1)}
                    title="Flyt ned"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => { setEditingId(item.id); setPending(item.draftDescription); }}
                      title="Rediger beskrivelse"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isBusy}
                    onClick={() =>
                      guard(() => collaborationsService.remove(item.id), 'Specialet kunne ikke fjernes')
                    }
                    title="Fjern speciale"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-2">
                {isEditing ? (
                  <div className="space-y-3">
                    <RichTextEditor
                      content={pending}
                      onChange={setPending}
                      placeholder="Beskriv samarbejdet…"
                    />
                    <div className="flex space-x-2 justify-end">
                      <Button variant="outline" onClick={() => setEditingId(null)}>
                        Annuller
                      </Button>
                      <Button
                        disabled={isBusy}
                        onClick={() =>
                          guard(async () => {
                            await collaborationsService.updateDescription(item.id, pending);
                            setEditingId(null);
                          }, 'Beskrivelsen kunne ikke gemmes')
                        }
                      >
                        <Save className="h-4 w-4 mr-1" /> Gem
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="prose max-w-none">
                    {item.draftDescription
                      ? renderRichText(item.draftDescription)
                      : <span className="text-gray-400 italic">Ingen beskrivelse endnu</span>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CollaborationList;
