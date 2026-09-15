# Prompt 22 — "Approve all" in the Redaktør approval dashboard

Two files, no schema change and no new RPC.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model or regenerate RLS.
- If a "find this" block does not match the file exactly, stop and report it.

---

## What it does

A button in the dashboard header approves and publishes every section that is
waiting, behind a confirmation naming the count.

Three things worth stating, because publishing is the one action here that other
people see immediately:

- **It approves exactly the sections that already show an individual "Approve &
  Publish" button** — `draft_content` present and not yet approved. A section
  with no draft, or one already approved, is left alone. The bulk action can
  never publish something you could not publish one at a time.
- **It stops at the first failure.** `approve_section` checks permission per
  *document*, so a refusal on one section refuses all of them; carrying on would
  produce a run of identical errors. Sections approved before the failure stay
  approved, and re-running skips them because they are no longer pending.
- **The confirmation says what is irreversible.** Each draft replaces the
  currently published text, which is what everyone else sees and what Ask AI
  reads. The previous published version is overwritten.

There is no bulk RPC, so this loops over the existing `approve_section` — which
is `SECURITY DEFINER` and does its own permission check, so the loop cannot
bypass anything.

Verified against the real `approve_section` on PostgreSQL 16: a write-level user
is refused and publishes nothing; an approver publishes both pending sections,
including overwriting one that had older published text, while an already
approved section and a section with no draft are untouched.

**Not included:** kerneopgaver. `kerneopgave_sections` has no
`published_content` column, so they are outside the approval flow entirely —
unchanged by this, and still invisible to Ask AI.

## 1. `src/services/documentService.ts`

Find:

```ts
  assignTeamLead: async (
```

Replace with:

```ts
  // Approve several sections in order.
  //
  // There is no bulk RPC and approve_section is SECURITY DEFINER with its own
  // permission check, so each section is a separate call. It stops at the first
  // failure: the check is per document, so a refusal on one section refuses
  // every other one too, and carrying on would only produce a run of identical
  // errors. Sections approved before the failure stay approved, and re-running
  // skips them because they are no longer pending.
  approveSections: async (
    sectionIds: string[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ approved: number; error: string | null }> => {
    let approved = 0;

    for (const sectionId of sectionIds) {
      const { data, error } = await supabase.rpc('approve_section', {
        section_id: sectionId,
      });

      if (error) {
        console.error('Error approving section:', error);
        return { approved, error: error.message };
      }
      if (data !== true) {
        return { approved, error: 'Sektionen kunne ikke findes.' };
      }

      approved++;
      onProgress?.(approved, sectionIds.length);
    }

    return { approved, error: null };
  },

  assignTeamLead: async (
```

## 2. `src/components/TeamLeadApproval.tsx`

Find:

```ts
import { Button } from '@/components/ui/button';
```

Replace with:

```ts
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
```

Find:

```ts
  const [isApproving, setIsApproving] = useState<string | null>(null);
```

Replace with:

```ts
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  // { done, total } while a bulk approval is running, otherwise null.
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
```

Find:

```ts
  const getSectionStatus = (section: DocumentSectionForApproval) => {
```

Replace with:

```ts
  // Exactly the sections that show an individual "Approve & Publish" button, so
  // the bulk action can never publish something the user could not publish one
  // at a time.
  const pendingSections = sections.filter(
    section => section.draft_content && !section.is_approved
  );

  const handleApproveAll = async () => {
    setConfirmAllOpen(false);
    setBulkProgress({ done: 0, total: pendingSections.length });
    try {
      const { approved, error } = await documentService.approveSections(
        pendingSections.map(section => section.id),
        (done, total) => setBulkProgress({ done, total })
      );

      if (error) {
        toast({
          title: approved > 0 ? 'Partially approved' : 'Approval failed',
          description:
            approved > 0
              ? `${approved} of ${pendingSections.length} sections were approved before it stopped: ${error}`
              : error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `${approved} ${approved === 1 ? 'section was' : 'sections were'} approved and published.`,
        });
      }

      await fetchSectionsForApproval();
      onApprovalChange?.();
    } finally {
      setBulkProgress(null);
    }
  };

  const getSectionStatus = (section: DocumentSectionForApproval) => {
```

Find:

```tsx
        <p className="text-gray-600 mb-4">
          Review and approve content changes for each section. Draft content will be published when approved.
        </p>
      </div>
```

Replace with:

```tsx
        <p className="text-gray-600 mb-4">
          Review and approve content changes for each section. Draft content will be published when approved.
        </p>

        {pendingSections.length > 0 && (
          <div className="flex items-center justify-between border-t pt-4">
            <p className="text-sm text-gray-600">
              {pendingSections.length}{' '}
              {pendingSections.length === 1 ? 'section is' : 'sections are'} waiting
              for approval.
            </p>
            <Button
              onClick={() => setConfirmAllOpen(true)}
              disabled={bulkProgress !== null || isApproving !== null}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              {bulkProgress
                ? `Approving ${bulkProgress.done} of ${bulkProgress.total}…`
                : `Approve all (${pendingSections.length})`}
            </Button>
          </div>
        )}
      </div>

      <AlertDialog open={confirmAllOpen} onOpenChange={setConfirmAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Approve all {pendingSections.length}{' '}
              {pendingSections.length === 1 ? 'section' : 'sections'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Each section's draft becomes the published version, replacing what is
              published today, and the result is what everyone else sees and what
              Ask AI reads. Sections with no draft, and sections already approved,
              are left alone. This cannot be undone from here — the previous
              published text is overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveAll}
              className="bg-green-600 hover:bg-green-700"
            >
              Approve and publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

Find:

```tsx
                      onClick={() => handleApproveSection(section.id)}
                      disabled={isApproving === section.id}
```

Replace with:

```tsx
                      onClick={() => handleApproveSection(section.id)}
                      disabled={isApproving === section.id || bulkProgress !== null}
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`, then on a document with several edited
sections:

1. The header shows "N sections are waiting for approval" and an
   **Approve all (N)** button.
2. Confirming publishes them; the button shows "Approving 3 of 8…" as it goes.
3. Afterwards the count disappears and every section reads "approved".
4. A section with no draft content is still listed and still not approved.
5. As a user with write but not approve access, the button reports a failure and
   publishes nothing.
