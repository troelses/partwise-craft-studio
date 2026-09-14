# Prompt 16 — fix: the import dialog's template list is empty

One file: `src/components/DocumentImportDialog.tsx`. No schema change, no new
dependency.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model or regenerate RLS.
- If a "find this" block does not match the file exactly, stop and report it
  rather than guessing.

---

## What is wrong

Opening **Importér fra Word** shows an empty template dropdown, and no error.

`loadTemplates()` is called from exactly one place — `handleOpenChange(true)`,
which is wired to Radix's `Dialog.onOpenChange`. That callback fires only when
the *dialog* asks to change state: Escape, an overlay click, the close button.
It never fires when the parent flips `open` to `true`, and that is how this
dialog is opened — `DocumentVersions` does `onClick={() => setIsImportOpen(true)}`.

So the fetch never runs, `templates` stays `[]`, and the picker renders with no
items. No error appears because no query was ever attempted, which is why this
looks like a permissions or data problem and is neither.

Confirmed in the installed library rather than assumed: `Dialog` holds its state
in `useControllableState`, which invokes the `onChange` callback only from inside
its own `setValue`. When the controlling prop changes from outside, no callback
fires at all.

The contrast that isolates it: the "New version" dialog in the same component
calls `templateService.getTemplates()` from its own click handler, and populates
correctly — same service, same RLS, same user.

## 1. Import `useEffect`

Find:

```ts
import React, { useState } from 'react';
```

Replace with:

```ts
import React, { useEffect, useState } from 'react';
```

## 2. Add a loading flag

Find:

```ts
  const [isWriting, setIsWriting] = useState(false);
```

Replace with:

```ts
  const [isWriting, setIsWriting] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
```

## 3. Load when the dialog opens

Find:

```ts
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
```

Replace with:

```ts
  const loadTemplates = async () => {
    if (templates.length > 0) return;
    setIsLoadingTemplates(true);
    try {
      setTemplates(await templateService.getTemplates());
    } catch (error) {
      toast({
        title: 'Fejl',
        description: errorMessage(error, 'Skabelonerne kunne ikke hentes'),
        variant: 'destructive',
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Load when the dialog opens.
  //
  // Radix's Dialog onOpenChange fires only when the *dialog* asks to change
  // state — Escape, an overlay click, the close button. It never fires when the
  // parent flips `open` to true, which is how this dialog is opened, so hanging
  // the fetch off it meant the list was never loaded and the picker was simply
  // empty with no error. The `open` prop is the signal that actually changes.
  useEffect(() => {
    if (!open) return;
    loadTemplates();
    // Seed the default only while nothing is chosen: the versions list can
    // refresh underneath the dialog, and overwriting a live choice would be
    // worse than leaving it blank.
    setTemplateId(current => current || currentTemplateId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentTemplateId]);
```

## 4. Stop loading from `handleOpenChange`

It is now handled by the effect, and leaving both would be two mechanisms for one
job. Find:

```ts
  const handleOpenChange = (value: boolean) => {
    if (!value) reset();
    else loadTemplates();
    onOpenChange(value);
  };
```

Replace with:

```ts
  const handleOpenChange = (value: boolean) => {
    if (!value) reset();
    onOpenChange(value);
  };
```

## 5. Distinguish the two empty states

This is the part that matters beyond the immediate fix. "Never fetched" and
"fetched and came back empty" looked identical on screen, which is what made this
need a bug report rather than being obvious. Find:

```tsx
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
```

Replace with:

```tsx
                  </SelectContent>
                </Select>
                {/* The two failure modes — never fetched, and fetched but
                    empty — looked identical on screen, which is what made the
                    bug above take a report to find. Say which one it is. */}
                {isLoadingTemplates && (
                  <p className="text-xs text-muted-foreground">Henter skabeloner…</p>
                )}
                {!isLoadingTemplates && templates.length === 0 && (
                  <p className="text-xs text-destructive">
                    Ingen skabeloner fundet. Kontrollér at skabelon-migrationerne
                    er kørt.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit` — plain `npx tsc --noEmit` checks nothing
in this repo.

Then:

1. Open **Importér fra Word**: both templates are listed, with the one the
   current version uses already selected.
2. Close with Escape and reopen: still populated. The `templates.length > 0`
   guard means it is fetched once per dialog lifetime, not once per open.
3. On a document whose version has no template: the list populates and nothing is
   preselected — rather than the dialog looking broken.
4. The "New version" dialog still populates.
