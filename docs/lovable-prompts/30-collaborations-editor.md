# Prompt 30 — structured Fællesopgaver: the editor

**Stage G**. Requires prompt 29 **and the types regenerated after it**, since the
new table is not in the generated types until then.

**Guardrails:**

- Make only the changes described.
- If a "find this" block does not match the file exactly, stop and report it.

---

## What this adds

Under "Fællesopgaver med andre specialer", the existing rich text becomes the
**introduction** and the specialties become a list below it — each one a row in
`kerneopgave_collaborations` with its own description.

- The specialty is chosen from the canonical `specialer` list, **or typed
  freely**. The drafts name 68 distinct specialties and the canonical list may
  not hold all of them, so a name that does not match is kept and marked
  `fritekst` rather than refused.
- Descriptions are rich text, not plain strings: ten of them carry footnotes in
  the real drafts.
- Items can be reordered, and editing one clears its approval — the same rule
  sections and subsections already follow, so an edited item comes back for
  review instead of reading as approved over older published text.

The other five subsections are untouched.

## 1. Create `src/services/collaborationsService.ts`

```ts
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
```

## 2. Create `src/components/DocumentEditor/CollaborationList.tsx`

```tsx
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
 * being buried in prose. In the real drafts 90% of this subsection is already
 * written as "<specialty>: <description>", so this is how the content is meant
 * to be shaped.
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
        <Button variant="outline" size="sm" className="justify-between min-w-[220px]">
          <span className="truncate">{value || 'Vælg speciale…'}</span>
          <ChevronDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <Command>
          <CommandInput placeholder="Søg speciale…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Ingen match i specialelisten.</CommandEmpty>
            {/* Free text is allowed on purpose — see the comment above. */}
            {typed && !exact && (
              <CommandGroup heading="Brug som skrevet">
                <CommandItem
                  value={typed}
                  onSelect={() => { onPick(typed, null); setOpen(false); setQuery(''); }}
                >
                  “{typed}”
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
  const [pending, setPending] = useState<string>('');
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

  const guard = async (action: () => Promise<void>, failure: string) => {
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
      () => collaborationsService.add(kerneopgaveSectionId, 'Nyt speciale', null, nextPosition).then(() => undefined),
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
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <h6 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Samarbejdende specialer
        </h6>
        <Button variant="outline" size="sm" onClick={addItem} disabled={isBusy}>
          <Plus className="h-4 w-4 mr-1" />
          Tilføj speciale
        </Button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">Ingen specialer tilføjet endnu.</p>
      )}

      <div className="space-y-3">
        {items.map((item, index) => {
          const isEditing = editingId === item.id;

          return (
            <div key={item.id} className="border rounded-md p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
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
                    <Badge variant="outline" title="Findes ikke i specialelisten">
                      fritekst
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" disabled={isBusy || index === 0}
                    onClick={() => move(index, -1)} title="Flyt op">
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={isBusy || index === items.length - 1}
                    onClick={() => move(index, 1)} title="Flyt ned">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {!isEditing && (
                    <Button variant="ghost" size="icon"
                      onClick={() => { setEditingId(item.id); setPending(item.draftDescription); }}
                      title="Rediger beskrivelse">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" disabled={isBusy}
                    onClick={() =>
                      guard(() => collaborationsService.remove(item.id), 'Specialet kunne ikke fjernes')
                    }
                    title="Fjern speciale">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-2">
                {isEditing ? (
                  <div className="space-y-2">
                    <RichTextEditor
                      content={pending}
                      onChange={setPending}
                      placeholder={`Hvordan er ${item.specialtyName || 'specialet'} relevant?`}
                    />
                    <div className="flex space-x-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(null)}>
                        Annuller
                      </Button>
                      <Button size="sm" disabled={isBusy}
                        onClick={() =>
                          guard(async () => {
                            await collaborationsService.updateDescription(item.id, pending);
                            setEditingId(null);
                          }, 'Beskrivelsen kunne ikke gemmes')
                        }>
                        <Save className="h-4 w-4 mr-1" /> Gem
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none">
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
```

## 3. `src/components/DocumentEditor/KerneopgaveItem.tsx`

Find:

```tsx
import { renderRichText } from '@/utils/richTextRenderer';
```

Replace with:

```tsx
import { renderRichText } from '@/utils/richTextRenderer';
import CollaborationList from '@/components/DocumentEditor/CollaborationList';
```

Find:

```tsx
                  <h5 className="text-sm font-semibold mb-2">
                    {KERNEOPGAVE_SECTION_LABELS[type]}
                  </h5>
```

Replace with:

```tsx
                  <h5 className="text-sm font-semibold mb-2">
                    {KERNEOPGAVE_SECTION_LABELS[type]}
                    {/* This subsection's rich text is the introduction to the
                        list below it, so say so rather than leaving the two
                        editors looking interchangeable. */}
                    {type === 'faellesopgaver' && (
                      <span className="ml-2 font-normal text-xs text-gray-500">
                        indledning
                      </span>
                    )}
                  </h5>
```

Find:

```tsx
                      placeholder={`Beskriv ${KERNEOPGAVE_SECTION_LABELS[type].toLowerCase()}…`}
```

Replace with:

```tsx
                      placeholder={
                        type === 'faellesopgaver'
                          ? 'Indledende tekst til fællesopgaverne…'
                          : `Beskriv ${KERNEOPGAVE_SECTION_LABELS[type].toLowerCase()}…`
                      }
```

Find:

```tsx
                    {content
                      ? renderRichText(content)
                      : <span className="text-gray-400 italic">Intet indhold endnu</span>}
                  </div>
                )}
```

Replace with:

```tsx
                    {content
                      ? renderRichText(content)
                      : <span className="text-gray-400 italic">Intet indhold endnu</span>}
                  </div>
                )}

                {/* The specialties themselves are rows in
                    kerneopgave_collaborations, not prose. The subsection row has
                    to exist before they can be keyed to it, which it always does
                    — addKerneopgave creates all six. */}
                {type === 'faellesopgaver' && getSectionId(type) && (
                  <CollaborationList kerneopgaveSectionId={getSectionId(type)} />
                )}
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit` — clean only once the types are
regenerated.

1. Open a kerneopgave and expand it. Under Fællesopgaver the rich text is now
   labelled *indledning*, with **Tilføj speciale** beneath it.
2. Add one, pick a specialty from the list, write a description, save.
3. Type a name that is not in `specialer` and use it as written — it should be
   accepted and badged `fritekst`.
4. Reorder two items and reload; the order holds.
5. Approve the document: the toast now also counts the collaboration items.
6. Edit an item you just approved — it should go back to unapproved.

Nothing else reads these rows yet. The read view, the exports and search follow
in Stage H, and the importer in Stage I, so an imported document will still show
its Fællesopgaver as one blob of intro text until then.
