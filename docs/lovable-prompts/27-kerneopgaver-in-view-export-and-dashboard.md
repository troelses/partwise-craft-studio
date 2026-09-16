# Prompt 27 — kerneopgaver in the read view, the approved export, and the dashboard

**Stage E** of `docs/kerneopgaver-approval-scope.md`, and the last of them.
Requires prompts 23–26. No migration.

**Guardrails:**

- Make only the changes described. Do not regenerate RLS.
- If a "find this" block does not match the file exactly, stop and report it.

---

## What this fixes

Stages B–D gave section 2.2 a published version, an approval path and AI
visibility. Three places still ignored all of it:

- **`Eksportér godkendt version` was not truthful.** Kerneopgaver had no
  published column when the two export variants were built, so both variants
  emitted drafts for section 2.2 — the largest part of the document. A document
  exported as "approved" contained unapproved text.
- **The read view showed drafts** for kerneopgaver while preferring published
  content for every ordinary section.
- **The approval dashboard did not list them**, so an approver could not see what
  "Approve all" was about to publish.

The selection rule is one function, verified in isolation:

| variant | approved subsection | never approved |
|---|---|---|
| `arbejdsudkast` | draft | draft |
| `godkendt version`, and the read view | **published** | falls back to draft |

Falling back matters: a subsection nobody has approved yet would otherwise vanish
from the approved export, which is worse than showing its draft. That is also how
`documentService.getDocument` already treats an unapproved section.

## The dashboard list is read-only, deliberately

Approval happens through `approve_document`, which covers both tables in one
transaction. A per-subsection approve button would need its own RPC and would
reintroduce exactly the partial-approval problem that function exists to avoid.

## 1. Create `src/components/KerneopgaveApprovalList.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import { CheckCircle, Clock, Eye, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderRichText } from '@/utils/richTextRenderer';
import {
  Kerneopgave,
  KerneopgaveSection,
  kerneopgaverService,
} from '@/services/kerneopgaverService';
import { KERNEOPGAVE_SECTION_LABELS } from '@/constants/kerneopgaver';

/**
 * The kerneopgave half of the approval dashboard.
 *
 * Section 2.2 is usually the largest part of a specialebeskrivelse, and until
 * now none of it appeared here: the dashboard listed document_sections only, so
 * an approver could not see what they were about to publish. "Approve all"
 * publishes these rows, so they have to be reviewable.
 *
 * Read-only by design. Approval happens through approve_document, which covers
 * both tables in one transaction; there is no per-subsection approve RPC, and
 * adding one would reintroduce the partial-approval problem that function exists
 * to avoid.
 */

interface KerneopgaveApprovalListProps {
  documentId: string;
  /** Changes whenever an approval happens, so the list reloads with it. */
  reloadSignal: string;
}

const statusOf = (section: KerneopgaveSection) => {
  if (section.isApproved) return { label: 'approved', Icon: CheckCircle, color: 'text-green-600' };
  if (!section.draftContent) return { label: 'empty', Icon: XCircle, color: 'text-gray-400' };
  if (section.publishedContent) return { label: 'has changes', Icon: Clock, color: 'text-blue-600' };
  return { label: 'pending', Icon: Clock, color: 'text-yellow-600' };
};

const KerneopgaveApprovalList: React.FC<KerneopgaveApprovalListProps> = ({
  documentId,
  reloadSignal,
}) => {
  const [kerneopgaver, setKerneopgaver] = useState<Kerneopgave[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    kerneopgaverService
      .getKerneopgaver(documentId)
      .then(data => { if (!cancelled) setKerneopgaver(data); })
      // A failure here must not take the sections half of the dashboard down.
      .catch(error => console.error('Error loading kerneopgaver for approval:', error));
    return () => { cancelled = true; };
  }, [documentId, reloadSignal]);

  if (kerneopgaver.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-4 border-b">
        <h3 className="font-medium">Kerneopgaver</h3>
        <p className="text-sm text-gray-500">
          Approved together with the sections above. Empty subsections are left alone.
        </p>
      </div>

      <div className="divide-y">
        {kerneopgaver.map(item => (
          <div key={item.id} className="p-4">
            <h4 className="font-medium text-sm mb-2">{item.title}</h4>

            <div className="space-y-2">
              {item.sections.map(section => {
                const { label, Icon, color } = statusOf(section);
                const key = `${item.id}-${section.sectionType}`;
                const isExpanded = expanded === key;

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span>{KERNEOPGAVE_SECTION_LABELS[section.sectionType] ?? section.sectionType}</span>
                        <span className="text-xs text-gray-500">{label}</span>
                      </div>
                      {(section.draftContent || section.publishedContent) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(isExpanded ? null : key)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          {isExpanded ? 'Hide' : 'Review'}
                        </Button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div>
                          <h5 className="text-xs font-medium text-blue-600 mb-1">Draft</h5>
                          <div className="border rounded p-2 bg-blue-50 min-h-[80px] prose prose-sm max-w-none">
                            {section.draftContent
                              ? renderRichText(section.draftContent)
                              : <p className="text-gray-400 italic">No draft content</p>}
                          </div>
                        </div>
                        <div>
                          <h5 className="text-xs font-medium text-green-600 mb-1">Published</h5>
                          <div className="border rounded p-2 bg-green-50 min-h-[80px] prose prose-sm max-w-none">
                            {section.publishedContent
                              ? renderRichText(section.publishedContent)
                              : <p className="text-gray-400 italic">Not published yet</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KerneopgaveApprovalList;
```

## 2. `src/services/kerneopgaverService.ts`

Find:

```ts
export interface KerneopgaveSection {
  id: string;
  kerneopgaveId: string;
  sectionType: KerneopgaveSectionType;
  draftContent: string;
  updatedAt: string;
}
```

Replace with:

```ts
export interface KerneopgaveSection {
  id: string;
  kerneopgaveId: string;
  sectionType: KerneopgaveSectionType;
  draftContent: string;
  /** The approved text, empty until the subsection has been approved. Section
   *  2.2 only became publishable in migration 20260917090000, so this is empty
   *  for everything written before that. */
  publishedContent: string;
  isApproved: boolean;
  updatedAt: string;
}
```

Find:

```ts
        draftContent: s.draft_content ? JSON.stringify(s.draft_content) : '',
        updatedAt: s.updated_at,
```

Replace with:

```ts
        draftContent: s.draft_content ? JSON.stringify(s.draft_content) : '',
        publishedContent: s.published_content ? JSON.stringify(s.published_content) : '',
        isApproved: !!s.is_approved,
        updatedAt: s.updated_at,
```

Find:

```ts
        sectionType,
        draftContent: '',
        updatedAt: new Date().toISOString(),
```

Replace with:

```ts
        sectionType,
        draftContent: '',
        publishedContent: '',
        isApproved: false,
        updatedAt: new Date().toISOString(),
```

## 3. `src/utils/documentContent.ts`

Find:

```ts
/**
 * Flatten a document into ordered blocks, splicing the kerneopgaver in at the
 * position of the section marked `section_key = 'kerneopgaver'`.
 *
 * `kerneopgave_sections` has no `published_content` column, so kerneopgaver are
 * always their draft text regardless of which export variant asked for them.
 */
export const buildContentBlocks = (
  sections: DocumentSection[],
  kerneopgaver: Kerneopgave[]
): ContentBlock[] => {

```

Replace with:

```ts
/**
 * Flatten a document into ordered blocks, splicing the kerneopgaver in at the
 * position of the section marked `section_key = 'kerneopgaver'`.
 *
 * Pass `{ prefer: 'published' }` to get the approved text for kerneopgaver as
 * well as sections. Until migration 20260917090000 they had no published column
 * at all, so "export the approved version" silently emitted drafts for section
 * 2.2 — the largest part of the document.
 */
export const buildContentBlocks = (
  sections: DocumentSection[],
  kerneopgaver: Kerneopgave[],
  opts?: { prefer?: 'draft' | 'published' }
): ContentBlock[] => {
  // Which text a kerneopgave subsection contributes. `sections` were already
  // resolved by whoever fetched them — documentService.getDocument takes the
  // same option — so only the kerneopgaver need deciding here.
  //
  // An unapproved subsection falls back to its draft rather than vanishing,
  // matching how getDocument treats a section that was never approved.
  const preferPublished = opts?.prefer === 'published';
  const subsectionContent = (sub?: { draftContent: string; publishedContent: string }): string => {
    if (!sub) return '';
    return preferPublished ? sub.publishedContent || sub.draftContent : sub.draftContent;
  };

```

Find:

```ts
          content: sub?.draftContent || '',
```

Replace with:

```ts
          content: subsectionContent(sub),
```

Find:

```ts
export const loadContentBlocks = async (document: Document): Promise<ContentBlock[]> => {
  const kerneopgaver = await fetchKerneopgaver(document.id);
  return buildContentBlocks(document.sections, kerneopgaver);
};
```

Replace with:

```ts
export const loadContentBlocks = async (
  document: Document,
  opts?: { prefer?: 'draft' | 'published' }
): Promise<ContentBlock[]> => {
  const kerneopgaver = await fetchKerneopgaver(document.id);
  return buildContentBlocks(document.sections, kerneopgaver, opts);
};
```

## 4. `src/utils/documentExporter.ts`

Find:

```ts
const buildBlocks = async (document: AppDocument): Promise<ContentBlock[]> => {
  const kerneopgaver = await fetchKerneopgaver(document.id);
  return buildContentBlocks(document.sections, kerneopgaver);
};
```

Replace with:

```ts
// The variant has to reach the kerneopgaver too. `document.sections` were
// already resolved by the caller, but section 2.2 lives in its own tables and
// used to be emitted as draft text under both variants.
const buildBlocks = async (
  document: AppDocument,
  variant: ExportVariant
): Promise<ContentBlock[]> => {
  const kerneopgaver = await fetchKerneopgaver(document.id);
  return buildContentBlocks(document.sections, kerneopgaver, { prefer: variant });
};
```

Find:

```ts
export const exportToWord = async (
  document: AppDocument,
  variant: ExportVariant = 'draft'
) => {
  try {
    const blocks = await buildBlocks(document);
```

Replace with:

```ts
export const exportToWord = async (
  document: AppDocument,
  variant: ExportVariant = 'draft'
) => {
  try {
    const blocks = await buildBlocks(document, variant);
```

Find:

```ts
export const exportToPDF = async (
  document: AppDocument,
  variant: ExportVariant = 'draft'
) => {
  try {
    const blocks = await buildBlocks(document);
```

Replace with:

```ts
export const exportToPDF = async (
  document: AppDocument,
  variant: ExportVariant = 'draft'
) => {
  try {
    const blocks = await buildBlocks(document, variant);
```

## 5. `src/components/DocumentContinuousView.tsx`

Find:

```tsx
    kerneopgaver
  ));
```

Replace with:

```tsx
    kerneopgaver,
    // This view already prefers published_content for sections; kerneopgaver
    // now follow the same rule instead of always showing drafts.
    { prefer: 'published' }
  ));
```

## 6. `src/components/TeamLeadApproval.tsx`

Find:

```ts
import { renderRichText } from '@/utils/richTextRenderer';
```

Replace with:

```ts
import { renderRichText } from '@/utils/richTextRenderer';
import KerneopgaveApprovalList from '@/components/KerneopgaveApprovalList';
```

Find:

```tsx
      {sections.length === 0 && (
```

Replace with:

```tsx
      {/* Section 2.2 lives in its own tables, so it is listed separately. It is
          approved together with the sections above by approve_document. The
          signal makes it reload when an approval changes anything. */}
      <KerneopgaveApprovalList
        documentId={documentId}
        reloadSignal={sections.map(section => `${section.id}:${section.is_approved}`).join(',')}
      />

      {sections.length === 0 && (
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`.

1. Approve a document, then edit one kerneopgave subsection without approving it
   again. The read view and *Eksportér godkendt version* should show the approved
   text; *Eksportér arbejdsudkast* should show your newer edit.
2. The approval dashboard lists every kerneopgave with its subsections and their
   status, and Review shows draft against published side by side.
3. A subsection that has never been approved still appears in the approved
   export, showing its draft — it is not silently dropped.
4. Empty subsections stay hidden in the read view, as before.
