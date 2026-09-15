# Prompt 25 — approve a whole document in one transaction

**Stage C** of `docs/kerneopgaver-approval-scope.md`. Requires prompts 23 and 24.

**Apply in this order.** The SQL first, then regenerate the types, then the code.
Unlike table columns, RPC names *are* typed in this project, so
`supabase.rpc('approve_document', …)` will not typecheck until the generated
types know the function exists. Verified both ways locally.

1. Run the migration below and create its file.
2. Regenerate the Supabase types — see `06-supabase-types.md`.
3. Apply the code changes in sections 2–4.

**Guardrails:**

- Make only the changes described. Do not regenerate RLS.
- If a "find this" block does not match the file exactly, stop and report it.

---

## What changes and why

Prompt 22's "Approve all" looped over `approve_section` from the browser. That
loop could not be atomic: a failure part-way left some sections published and the
rest not, and the user had to read a "3 of 8 approved" message to find out. It
also could not touch kerneopgaver at all, because `approve_section` resolves its
argument in `document_sections`.

`approve_document(doc_id)` replaces it. One function, one transaction, both
tables. **`approve_section` is untouched** — the per-section button keeps using it.

Verified on PostgreSQL 16 with the real guards from prompt 24 in place:

| | result |
|---|---|
| write-level user calls it | refused: *Not authorised to approve this document*, nothing published |
| approver calls it | 2 sections and 2 kerneopgave subsections approved |
| a section with no draft | untouched |
| a section already approved | untouched |
| running it again | `0 / 0`, a clean no-op |
| **one subsection rigged to fail mid-way** | **nothing at all approved or published** |

That last row is the point of the stage. Three sections and two subsections were
pending; one subsection raised; the sections update that had already succeeded
rolled back with it. The client loop could not offer that.

## The count in the button

The dashboard does not list kerneopgave subsections yet — that is Stage E — but
`approve_document` publishes them. So the header and the confirmation now count
them too, via `countPendingSubsections`. Without it the button would say
"Approve all (7)" and then publish forty-odd more rows than it named.

## 1. Run this in the Supabase SQL editor, then create `supabase/migrations/20260918090000-approve-document.sql`

```sql
-- Approve a whole document in one transaction.
--
-- Stage C of docs/kerneopgaver-approval-scope.md. Requires the publish columns
-- from 20260917090000.
--
-- This replaces a client-side loop over approve_section. The loop could not be
-- atomic: it approved sections one at a time, so a failure part-way left some
-- published and the rest not, and the user had to read a "3 of 8 approved"
-- message to find out. A single function is one transaction — it commits
-- entirely or not at all.
--
-- It also covers kerneopgave subsections, which approve_section cannot reach:
-- that function resolves its argument in document_sections, and kerneopgaver
-- live in their own tables.
--
-- Pending means exactly what the dashboard shows as pending: draft content
-- present, not currently approved. A row with no draft is left alone, and so is
-- one already approved.
--
-- The publish guards on both tables still fire on these updates. They are not
-- bypassed by SECURITY DEFINER, because auth.uid() reports the caller either
-- way — the permission check below is what makes them pass.
--
-- approve_section is untouched; the per-section button keeps using it.

CREATE OR REPLACE FUNCTION public.approve_document(doc_id uuid)
RETURNS TABLE (sections_approved integer, kerneopgave_sections_approved integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sections integer := 0;
  v_subsections integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = doc_id) THEN
    RAISE EXCEPTION 'Document % not found', doc_id;
  END IF;

  IF NOT public.can_approve_document(doc_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to approve this document';
  END IF;

  UPDATE public.document_sections
     SET published_content = draft_content,
         is_approved       = true,
         approved_by       = auth.uid(),
         approved_at       = now(),
         updated_at        = now()
   WHERE document_id   = doc_id
     AND draft_content IS NOT NULL
     AND is_approved   IS DISTINCT FROM true;
  GET DIAGNOSTICS v_sections = ROW_COUNT;

  UPDATE public.kerneopgave_sections ks
     SET published_content = ks.draft_content,
         is_approved       = true,
         approved_by       = auth.uid(),
         approved_at       = now(),
         updated_at        = now()
    FROM public.kerneopgaver k
   WHERE k.id               = ks.kerneopgave_id
     AND k.document_id      = doc_id
     AND ks.draft_content   IS NOT NULL
     AND ks.is_approved     IS DISTINCT FROM true;
  GET DIAGNOSTICS v_subsections = ROW_COUNT;

  RETURN QUERY SELECT v_sections, v_subsections;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_document(uuid) TO authenticated;
```

Then regenerate the types before applying the rest.

## 2. `src/services/documentService.ts`

Find:

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
```

Replace with:

```ts
  // Approve every pending section of a document — ordinary sections and
  // kerneopgave subsections alike — in one transaction.
  //
  // This replaces a client-side loop over approve_section. The loop could not be
  // atomic, so a failure part-way left some sections published and the rest not.
  // approve_document commits entirely or not at all, which is also what lets it
  // cover kerneopgaver: approve_section cannot reach them, because it resolves
  // its argument in document_sections.
  //
  // Returns the counts it approved. Re-running is a no-op: nothing is pending.
  approveDocument: async (
    documentId: string
  ): Promise<{ sections: number; kerneopgaveSections: number }> => {
    const { data, error } = await supabase.rpc('approve_document', {
      doc_id: documentId,
    });

    if (error) {
      console.error('Error approving document:', error);
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | { sections_approved?: number; kerneopgave_sections_approved?: number }
      | null;

    return {
      sections: row?.sections_approved ?? 0,
      kerneopgaveSections: row?.kerneopgave_sections_approved ?? 0,
    };
  },
```

## 3. `src/services/kerneopgaverService.ts`

Find:

```ts
  async updateKerneopgaveTitle(id: string, title: string): Promise<void> {
```

Replace with:

```ts
  /** How many kerneopgave subsections are waiting for approval, so the dashboard
   *  can say what "approve all" is about to publish. Counts the same rows
   *  approve_document will touch: draft present, not currently approved.
   *
   *  Two queries rather than one embedded filter, and the pending test applied
   *  here rather than as PostgREST filters: both `kerneopgaver!inner(...)` and a
   *  head/count query with three chained filters make the generated types
   *  recurse deep enough that tsc gives up. The row counts are in the hundreds,
   *  so filtering client-side costs nothing. */
  async countPendingSubsections(documentId: string): Promise<number> {
    const { data: items, error: itemsError } = await supabase
      .from('kerneopgaver')
      .select('id')
      .eq('document_id', documentId);

    if (itemsError) throw itemsError;
    const ids = (items || []).map(item => item.id);
    if (ids.length === 0) return 0;

    const { data: rows, error } = await supabase
      .from('kerneopgave_sections')
      .select('id, draft_content, is_approved')
      .in('kerneopgave_id', ids);

    if (error) throw error;

    return (rows || []).filter(row => row.draft_content !== null && !row.is_approved).length;
  },

  async updateKerneopgaveTitle(id: string, title: string): Promise<void> {
```

## 4. `src/components/TeamLeadApproval.tsx`

Find:

```ts
import { documentService } from '@/services/documentService';
```

Replace with:

```ts
import { documentService } from '@/services/documentService';
import { kerneopgaverService } from '@/services/kerneopgaverService';
```

Find:

```ts
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
```

Replace with:

```ts
  const [isApprovingAll, setIsApprovingAll] = useState(false);
  // Kerneopgave subsections waiting for approval. They are not listed in this
  // dashboard yet, but approve_document publishes them, so the count must be
  // shown or the button would understate what it is about to do.
  const [pendingSubsections, setPendingSubsections] = useState(0);
```

Find:

```ts
      const data = await documentService.getDocumentSectionsForApproval(documentId);
      setSections(data);
```

Replace with:

```ts
      const data = await documentService.getDocumentSectionsForApproval(documentId);
      setSections(data);
      setPendingSubsections(await kerneopgaverService.countPendingSubsections(documentId));
```

Find:

```ts
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
```

Replace with:

```ts
  const handleApproveAll = async () => {
    setConfirmAllOpen(false);
    setIsApprovingAll(true);
    try {
      const { sections: approvedSections, kerneopgaveSections } =
        await documentService.approveDocument(documentId);

      toast({
        title: 'Success',
        description:
          `${approvedSections} ${approvedSections === 1 ? 'section' : 'sections'} and ` +
          `${kerneopgaveSections} kerneopgave ` +
          `${kerneopgaveSections === 1 ? 'subsection' : 'subsections'} ` +
          'were approved and published.',
      });

      await fetchSectionsForApproval();
      onApprovalChange?.();
    } catch (error) {
      // One transaction: if this failed, nothing was published, so there is no
      // partial state to explain or clean up.
      toast({
        title: 'Approval failed',
        description:
          error instanceof Error && error.message
            ? `${error.message}. Nothing was published.`
            : 'Nothing was published.',
        variant: 'destructive',
      });
    } finally {
      setIsApprovingAll(false);
    }
  };
```

Find:

```tsx
        {pendingSections.length > 0 && (
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <p className="text-sm text-yellow-700">
              <strong>{pendingSections.length}</strong>{' '}
              {pendingSections.length === 1 ? 'section is' : 'sections are'} waiting
              for approval.
            </p>
            <Button
              onClick={() => setConfirmAllOpen(true)}
              disabled={bulkProgress !== null || isApproving !== null}
              className="bg-green-600 hover:bg-green-700"
            >
              {bulkProgress
                ? `Approving ${bulkProgress.done} of ${bulkProgress.total}…`
                : `Approve all (${pendingSections.length})`}
            </Button>
          </div>
        )}
```

Replace with:

```tsx
        {pendingSections.length + pendingSubsections > 0 && (
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <p className="text-sm text-yellow-700">
              <strong>{pendingSections.length}</strong>{' '}
              {pendingSections.length === 1 ? 'section' : 'sections'}
              {pendingSubsections > 0 && (
                <>
                  {' '}and <strong>{pendingSubsections}</strong> kerneopgave{' '}
                  {pendingSubsections === 1 ? 'subsection' : 'subsections'}
                </>
              )}{' '}
              waiting for approval.
            </p>
            <Button
              onClick={() => setConfirmAllOpen(true)}
              disabled={isApprovingAll || isApproving !== null}
              className="bg-green-600 hover:bg-green-700"
            >
              {isApprovingAll
                ? 'Approving…'
                : `Approve all (${pendingSections.length + pendingSubsections})`}
            </Button>
          </div>
        )}
```

Find:

```tsx
              <AlertDialogTitle>
                Approve all {pendingSections.length}{' '}
                {pendingSections.length === 1 ? 'section' : 'sections'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Each section&apos;s draft becomes the published version, replacing what is
                published today, and the result is what everyone else sees and what
                Ask AI reads. Sections with no draft, and sections already approved,
                are left alone. This cannot be undone from here — the previous
                published text is overwritten.
              </AlertDialogDescription>
```

Replace with:

```tsx
              <AlertDialogTitle>
                Approve {pendingSections.length}{' '}
                {pendingSections.length === 1 ? 'section' : 'sections'}
                {pendingSubsections > 0 &&
                  ` and ${pendingSubsections} kerneopgave ${
                    pendingSubsections === 1 ? 'subsection' : 'subsections'
                  }`}
                ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Each draft becomes the published version, replacing what is
                published today, and the result is what everyone else sees and what
                Ask AI reads. Anything with no draft, and anything already approved,
                is left alone. It runs as one transaction, so either all of it
                publishes or none of it does. This cannot be undone from here — the
                previous published text is overwritten.
              </AlertDialogDescription>
```

Find:

```tsx
disabled={isApproving === section.id || bulkProgress !== null}
```

Replace with:

```tsx
disabled={isApproving === section.id || isApprovingAll}
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit` — clean only once the types are
regenerated.

1. The dashboard header counts sections **and** kerneopgave subsections.
2. Approving reports both counts.
3. As a user with write but not approve access, it fails and says nothing was
   published — which is now literally true rather than best-effort.
4. Approving again immediately reports `0` and `0`.
