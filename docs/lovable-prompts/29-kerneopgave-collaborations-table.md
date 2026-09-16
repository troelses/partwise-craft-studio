# Prompt 29 — structured Fællesopgaver: the table

**Stage F** of the structured-Fællesopgaver work. Requires prompts 23–28.
One migration and two small client changes.

**Order:** run the SQL, regenerate the Supabase types, then apply the code —
`approve_document`'s return type changes, and RPC shapes are typed.

**Guardrails:**

- Make only the changes described. Do not regenerate RLS on other tables.
- Do not touch `specialty_collaborations`. It exists, is referenced by no code,
  and is **not** what this uses — see below.

---

## Why

`Fællesopgaver med andre specialer` names other specialties and says how each is
relevant, but it is one rich-text blob, so nothing can be cross-referenced: there
is no way to ask which specialties collaborate with a given one.

Measured across all 13 drafts, its 642 paragraphs are:

| | count | share |
|---|---|---|
| already written as `<specialty>: <description>` | 578 | 90% |
| introductory text before the first item | 51 | 8% |
| neither | 13 | 2% |

So the structure is already in the documents; only the storage was missing. The
8% also settles where the intro text goes: the subsection keeps its existing
rich text for exactly that, and only the items move to the new table.

## What this stage does and does not do

It creates the table, its grants, its RLS, its publish guard, and extends
`approve_document`. **Nothing reads or writes it yet** — the editor is Stage G,
the read view and search Stage H, the importer Stage I.

## Three things worth knowing

**`specialty_id` is nullable, `specialty_name` is not.** The drafts name 68
distinct specialties and not all will match `specialer`. The name is always
stored; the key is set when the name is recognised. Unmatched names are still
searchable and are a useful report — they are either missing from `specialer` or
spelled differently.

**The column type is derived, not guessed.** `public.specialer` was created
outside version control, so its `id` may be `int4` or `int8`. The migration reads
the actual type and matches it, and carries on with a plain column if the table
is missing entirely. Verified against `bigint`, `integer`, and absent.

**Grants are explicit.** Supabase's default privileges would probably cover a new
table, but a table readable by nobody is precisely how `templates` came to return
zero rows to every user — and from the app it looks identical to a data problem.

**This is not `specialty_collaborations`.** That table exists and is used by no
code. It keys to documents rather than kerneopgaver and requires the collaborator
to have its own document; 13 of the 68 named specialties do. Leave it alone.

## Verified on PostgreSQL 16

| | result |
|---|---|
| writer adds an item, edits its draft | succeeds |
| writer INSERTs with `published_description` preset | **refused** |
| writer INSERTs with `is_approved = true` | **refused** |
| writer UPDATEs `published_description` | **refused** |
| user with no access reads | 0 rows |
| user with no access inserts | **refused by RLS** |
| approver runs `approve_document` | publishes it, returns a third count |
| re-running the migration | clean |

## 1. Run this in the Supabase SQL editor, then create `supabase/migrations/20260921090000-kerneopgave-collaborations.sql`

```sql
-- Structured "Fællesopgaver med andre specialer".
--
-- Stage F of the structured-Fællesopgaver plan. Requires the publish columns
-- (20260917090000) and approve_document (20260918090000).
--
-- That subsection names other specialties and says how each is relevant, but it
-- was one rich-text blob, so nothing could be cross-referenced: there was no way
-- to ask which specialties collaborate with a given one. Measured across the 13
-- real drafts, 90% of its 642 paragraphs are already written as
-- "<specialty>: <description>", so the structure exists in the documents and only
-- the storage was missing.
--
-- The subsection's own draft_content/published_content stays as the section's
-- introductory text -- 8% of those paragraphs are exactly that -- and the items
-- move here. No content is migrated by this migration; nothing reads the table
-- until Stage G.
--
-- Items carry their own draft/published pair and approval flags, so they follow
-- the same rule as the rest of section 2.2: nothing is public until an approver
-- says so. approve_document is extended below to cover them in the same
-- transaction.

-- 1. Table ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kerneopgave_collaborations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Keyed to the faellesopgaver subsection row, which is keyed to the
  -- kerneopgave, which is keyed to the document.
  kerneopgave_section_id uuid NOT NULL
                           REFERENCES public.kerneopgave_sections(id) ON DELETE CASCADE,
  position               integer NOT NULL DEFAULT 0,
  -- The canonical specialty when the name is recognised, and the name as
  -- written either way. 68 distinct names appear across the drafts and not all
  -- of them will match, so the name is the required half and the key optional.
  specialty_id           bigint,
  specialty_name         text NOT NULL,
  draft_description      jsonb,
  published_description  jsonb,
  is_approved            boolean NOT NULL DEFAULT false,
  approved_by            uuid,
  approved_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_section_idx
  ON public.kerneopgave_collaborations (kerneopgave_section_id, position);

-- Cross-referencing by specialty is the point of the table, so index both the
-- key and the name: unmatched names still have to be findable.
CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_specialty_idx
  ON public.kerneopgave_collaborations (specialty_id);
CREATE INDEX IF NOT EXISTS kerneopgave_collaborations_name_idx
  ON public.kerneopgave_collaborations (lower(specialty_name));

-- public.specialer was created outside version control, so its id may be int4
-- or int8 depending on how it was made. Match it rather than guess, and carry on
-- with a plain column if it cannot be referenced -- an unmatched name is already
-- a supported state, so a missing constraint must not block the migration.
DO $$
DECLARE
  v_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'specialer'
     AND a.attname = 'id' AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_type IS NULL THEN
    RAISE NOTICE 'public.specialer not found; specialty_id stays a plain column.';
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.kerneopgave_collaborations ALTER COLUMN specialty_id TYPE %s USING specialty_id::%s',
    v_type, v_type);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'kerneopgave_collaborations_specialty_id_fkey'
       AND conrelid = 'public.kerneopgave_collaborations'::regclass
  ) THEN
    ALTER TABLE public.kerneopgave_collaborations
      ADD CONSTRAINT kerneopgave_collaborations_specialty_id_fkey
      FOREIGN KEY (specialty_id) REFERENCES public.specialer(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not reference public.specialer (%); specialty_id stays a plain column.', SQLERRM;
END $$;

-- 2. Grants and RLS, mirroring kerneopgave_sections after 20260916090000 --------
-- Granted explicitly rather than left to Supabase's default privileges. A table
-- that is readable by nobody is how the templates table came to return zero rows
-- to every user, and it looks identical to a data problem from the app.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kerneopgave_collaborations TO authenticated;

ALTER TABLE public.kerneopgave_collaborations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read collaborations by access" ON public.kerneopgave_collaborations;
CREATE POLICY "Read collaborations by access"
  ON public.kerneopgave_collaborations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.kerneopgave_sections ks
        JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
       WHERE ks.id = kerneopgave_collaborations.kerneopgave_section_id
         AND public.has_document_access(k.document_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Write collaborations (write+)" ON public.kerneopgave_collaborations;
CREATE POLICY "Write collaborations (write+)"
  ON public.kerneopgave_collaborations FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM public.kerneopgave_sections ks
        JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
       WHERE ks.id = kerneopgave_collaborations.kerneopgave_section_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.kerneopgave_sections ks
        JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
       WHERE ks.id = kerneopgave_collaborations.kerneopgave_section_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  );

-- 3. Publish guard -------------------------------------------------------------
-- A new publishable column is a new hole unless it is guarded. INSERT as well as
-- UPDATE, the shape settled in 20260920090000.
CREATE OR REPLACE FUNCTION public.guard_collaboration_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc uuid;
BEGIN
  IF (NEW.is_approved IS TRUE
        AND (TG_OP = 'INSERT' OR OLD.is_approved IS DISTINCT FROM TRUE))
     OR (TG_OP = 'INSERT' AND NEW.published_description IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.published_description IS DISTINCT FROM OLD.published_description)
  THEN
    SELECT k.document_id INTO v_doc
      FROM public.kerneopgave_sections ks
      JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
     WHERE ks.id = NEW.kerneopgave_section_id;

    IF v_doc IS NULL OR NOT public.can_approve_document(v_doc, auth.uid()) THEN
      RAISE EXCEPTION 'Only approvers can publish a collaboration';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_collaboration_publish_trg ON public.kerneopgave_collaborations;
CREATE TRIGGER guard_collaboration_publish_trg
  BEFORE INSERT OR UPDATE ON public.kerneopgave_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.guard_collaboration_publish();

-- 4. approve_document covers collaborations too ---------------------------------
-- The return type gains a third count, and CREATE OR REPLACE cannot change a
-- function's return type, so it has to be dropped first. Nothing depends on it
-- in the database -- it is called from the client -- so the drop is safe.
DROP FUNCTION IF EXISTS public.approve_document(uuid);

CREATE FUNCTION public.approve_document(doc_id uuid)
RETURNS TABLE (
  sections_approved             integer,
  kerneopgave_sections_approved integer,
  collaborations_approved       integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sections       integer := 0;
  v_subsections    integer := 0;
  v_collaborations integer := 0;
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
   WHERE k.id             = ks.kerneopgave_id
     AND k.document_id    = doc_id
     AND ks.draft_content IS NOT NULL
     AND ks.is_approved   IS DISTINCT FROM true;
  GET DIAGNOSTICS v_subsections = ROW_COUNT;

  UPDATE public.kerneopgave_collaborations kc
     SET published_description = kc.draft_description,
         is_approved           = true,
         approved_by           = auth.uid(),
         approved_at           = now(),
         updated_at            = now()
    FROM public.kerneopgave_sections ks
    JOIN public.kerneopgaver k ON k.id = ks.kerneopgave_id
   WHERE ks.id                 = kc.kerneopgave_section_id
     AND k.document_id         = doc_id
     AND kc.is_approved        IS DISTINCT FROM true;
  GET DIAGNOSTICS v_collaborations = ROW_COUNT;

  RETURN QUERY SELECT v_sections, v_subsections, v_collaborations;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_document(uuid) TO authenticated;
```

Then regenerate the types before applying the code below.

## 2. `src/services/documentService.ts`

Find:

```ts
  approveDocument: async (
    documentId: string
  ): Promise<{ sections: number; kerneopgaveSections: number }> => {
```

Replace with:

```ts
  approveDocument: async (
    documentId: string
  ): Promise<{ sections: number; kerneopgaveSections: number; collaborations: number }> => {
```

Find:

```ts
    const row = (Array.isArray(data) ? data[0] : data) as
      | { sections_approved?: number; kerneopgave_sections_approved?: number }
      | null;

    return {
      sections: row?.sections_approved ?? 0,
      kerneopgaveSections: row?.kerneopgave_sections_approved ?? 0,
    };
```

Replace with:

```ts
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          sections_approved?: number;
          kerneopgave_sections_approved?: number;
          collaborations_approved?: number;
        }
      | null;

    return {
      sections: row?.sections_approved ?? 0,
      kerneopgaveSections: row?.kerneopgave_sections_approved ?? 0,
      collaborations: row?.collaborations_approved ?? 0,
    };
```

## 3. `src/components/TeamLeadApproval.tsx`

Find:

```ts
      const { sections: approvedSections, kerneopgaveSections } =
        await documentService.approveDocument(documentId);
```

Replace with:

```ts
      const { sections: approvedSections, kerneopgaveSections, collaborations } =
        await documentService.approveDocument(documentId);
```

Find:

```ts
          `${kerneopgaveSections} kerneopgave ` +
          `${kerneopgaveSections === 1 ? 'subsection' : 'subsections'} ` +
          'were approved and published.',
```

Replace with:

```ts
          `${kerneopgaveSections} kerneopgave ` +
          `${kerneopgaveSections === 1 ? 'subsection' : 'subsections'}` +
          (collaborations > 0
            ? ` and ${collaborations} collaboration ${collaborations === 1 ? 'item' : 'items'}`
            : '') +
          ' were approved and published.',
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit` — clean once the types are regenerated.

Nothing changes on screen. Confirm the table exists and is guarded, as a
non-approver in the SQL editor:

```sql
insert into public.kerneopgave_collaborations
  (kerneopgave_section_id, specialty_name, published_description)
values ('<a faellesopgaver subsection id>', 'Radiologi', '{}'::jsonb);
-- expected: ERROR  Only approvers can publish a collaboration
```
