# Scope: kerneopgaver in the approval flow and in Ask AI

## Why

`kerneopgave_sections` was created with a single content column, `draft_content`.
It has no `published_content`, no `is_approved`, no `approved_by` / `approved_at`.
Consequently section 2.2 sits outside the approval flow and is invisible to
search and to Ask AI.

Measured across the 13 draft specialebeskrivelser, **58% of the text lives in
kerneopgaver** — 336k characters against 243k in ordinary sections. Section 2.2
is the largest part of a specialebeskrivelse, so this is the majority of the
corpus, not an edge case.

This was my design decision when writing migration `20260831120000`, and it was
recorded in the plan as a limitation rather than put forward as a choice. The
work below closes it.

## What is true today — verified, not recalled

- **`kerneopgave_sections`**: `id, kerneopgave_id, section_type, draft_content,
  updated_at`. Nothing to publish into.
- **`approve_section(section_id uuid)`** resolves the id in `document_sections`
  and copies `draft_content → published_content` on that row. There is no
  equivalent for kerneopgaver.
- **All three AI/search RPCs** — `count_documents_containing`,
  `search_documents`, `get_document_text` — join `document_sections` alone and
  read `published_content` alone. Ask AI reaches them through the
  `query-documents` edge function, which exposes only those three tools. So even
  with a `published_content` column, kerneopgaver would stay invisible: the join
  is not there either.
- **The GIN index** `document_sections_published_fts_idx` is on
  `document_sections` only.

### The finding that reshapes this work

The kerneopgave policies are on the **legacy `user_permissions` table**, while
everything else moved to `document_access`. Reproduced on PostgreSQL 16 with the
real policies:

| user | grant | kerneopgaver rows visible |
|---|---|---|
| C | `document_access = 'approve'` | **0 of 1** |
| D | `document_access = 'view'` plus legacy `can_view` | 1 of 1 |

So a user whose access was granted the modern way sees **no kerneopgaver at
all** — not in the read view, not in the editor. That is a live defect today,
independent of this work.

It also makes the AI integration impossible to do honestly without fixing it
first: the RPCs are `security invoker`, so RLS applies to the caller. Adding
kerneopgaver to them would make search results differ between two users with
identical `document_access`, depending on whether either happens to hold a row
in a legacy table. Silent, per-user, and very hard to diagnose.

## Stages

### Stage A — move kerneopgave RLS onto `document_access` (prerequisite)

Replace the four `user_permissions`-based policies on `kerneopgaver` and
`kerneopgave_sections` with `has_document_access` for reading and
`can_write_document` for writing, matching `document_sections`. Keep the admin
and team-lead policies as they are.

**This is a security-model change and needs an explicit decision.** It was
offered at prompt 15 and declined in favour of the narrower fix (copying legacy
rows in `create_document_version`), which was right for that problem. It is not
sufficient here, for the reason above.

Net effect on access: anyone with `document_access` gains the kerneopgave
visibility they should already have had; anyone holding *only* a legacy
`user_permissions` row and no `document_access` loses it. Whether that second
group exists is a question about your data, and the migration should report the
count before changing anything.

### Stage B — schema

Add to `kerneopgave_sections`: `published_content jsonb`, `is_approved boolean
not null default false`, `approved_by uuid`, `approved_at timestamptz`.

**A publish guard trigger is required, not optional.** `document_sections` has
`guard_section_publish_trg`, which blocks a non-approver from writing
`published_content` directly. The kerneopgave write policy is `FOR ALL` with a
`USING` clause and no `WITH CHECK`, so without an equivalent trigger any editor
could set `published_content` themselves and bypass approval entirely. Mirror
the trigger.

### Stage C — approve the whole document in one call

New `approve_document(doc_id uuid)`: `SECURITY DEFINER`, one transaction,
approves every pending `document_sections` row **and** every pending
`kerneopgave_sections` row, returning the counts.

This supersedes part of what prompt 22 just shipped: the dashboard's client-side
loop over `approve_section` becomes a single RPC call. That is a strict
improvement — the loop's partial-failure case ("3 of 8 approved, then it
stopped") disappears, because the whole thing commits or none of it does. The
per-section button keeps calling `approve_section` unchanged.

### Stage D — search and Ask AI

Extend the three RPCs with a `UNION ALL` branch over
`kerneopgave_sections.published_content`, and add a second functional GIN index
on that column. The index is new, so unlike migration `20260903090000` there is
no stale-index hazard and no `REINDEX` — existing entries cannot be wrong when
none exist.

`get_document_text` needs a label for the new rows. Proposal:
`'2.2 Kerneopgaver › ' || k.title || ' › ' || <subsection label>`, so the model
can tell which kerneopgave and which subsection a passage belongs to, and
ordering by template position, then `kerneopgaver.position`, then the canonical
subsection order.

**Two costs worth accepting knowingly:**

- The Danish subsection labels would exist in SQL as well as in
  `src/constants/kerneopgaver.ts`. That is a second place to update when a
  subsection is added — exactly what happened with `Ambulant`. A small
  `kerneopgave_section_labels` table seeded by migration would avoid the
  duplication and is worth considering.
- **Kerneopgave titles would still not be searchable.** `search_documents` would
  match subsection body text only, so a search for *"Fald"* finds geriatri only
  if those letters appear in a body paragraph. Indexing `kerneopgaver.title` as
  well is a small add-on; at 126 items the cost is negligible, but it needs its
  own index expression to stay fast as the corpus grows.

### Stage E — read view and export

- `documentContent.buildContentBlocks` gains the same `prefer: 'draft' |
  'published'` notion `documentService.getDocument` already has, and
  `fetchKerneopgaver` returns both contents.
- `DocumentContinuousView` prefers published for kerneopgaver, as it already
  does for sections.
- *Eksportér godkendt version* becomes truthful for section 2.2. Today
  kerneopgaver export as drafts under **both** variants, which the UI notes but
  which is a real inconsistency in a document presented as approved.
- The approval dashboard lists kerneopgave subsections alongside sections, with
  the same draft/published comparison.

## Risks

- **Stage A changes who can see what.** It should be applied only after counting
  users who hold legacy rows without `document_access`. Everything else in this
  scope depends on it.
- **The guard trigger is the security-critical piece.** Without it Stage B hands
  every editor the ability to publish. It must land in the same migration as the
  columns, never after.
- **Approving becomes a bigger action.** One click would publish section text and
  potentially a hundred kerneopgave subsections. The confirmation must say so,
  and the count must be shown before, not after.
- **Ask AI's answers change materially.** It would suddenly see 58% more text.
  That is the point, but it is worth re-checking a few known questions before and
  after so the change is understood rather than assumed.
- **Two label sources** unless the labels move into a table — see Stage D.

## Verification

- **Stage A** on the PostgreSQL 16 harness already built for this: user C
  (`document_access` only) currently sees 0 kerneopgaver and must see them after;
  a user with neither grant must still see none.
- **Stage B**: an editor without approve rights must be refused when writing
  `published_content` directly — the assertion that proves the trigger works,
  not merely that it exists.
- **Stage C**: approving a document with a deliberately failing row must leave
  *nothing* approved, proving atomicity. Compare against prompt 22's loop, which
  cannot offer that.
- **Stage D**: a term appearing only inside a kerneopgave subsection must be
  found by `search_documents`, and `get_document_text` must return it labelled
  with its kerneopgave and subsection. Degenerate input — null, empty jsonb,
  empty note arrays — must not error, since the function backs an index.
- **Stage E**: approve one kerneopgave subsection, edit it again without
  approving, then check the read view shows the approved text and
  *Eksportér arbejdsudkast* shows the newer edit.

## Delivery

Five prompts, in stage order. Stage A ships alone and can be judged on its own,
since it is the only one that changes who can see what. Stages B and C belong in
one migration each with their code; D and E are independent of each other and can
land in either order once B and C are in.
