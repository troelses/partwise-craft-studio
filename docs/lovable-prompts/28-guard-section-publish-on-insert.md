# Prompt 28 — close the INSERT hole in the document_sections publish guard

SQL only. No code change. Independent of prompts 23–27 — it can go in before,
after or between them.

**Guardrails:**

- Run the SQL in the Supabase SQL editor, then create the file.
- Do not re-run migration `20260901090000`. See below.

---

## What is wrong

`guard_section_publish_trg` has been `BEFORE UPDATE` only since
`20260701110410`. It catches a writer who *edits* `published_content`, but not
one who creates the row with it already set. The INSERT policy is
`can_write_document`, so any write-level user can publish arbitrary text by
inserting rather than updating.

Reproduced on PostgreSQL 16 with the real policies and the real guard. As a
user holding nothing but `document_access = 'write'`:

```sql
insert into public.document_sections
  (document_id, template_section_id, draft_content, published_content, is_approved)
values (…, …, '{"d":1}', '{"SMUGLET":1}', true);
-- INSERT 0 1
```

That is worse than it first looks: the same statement sets `is_approved`, so the
row reads as approved, and after Stage D that text reaches full-text search and
Ask AI as well as the read view and the approved export — without an approver
ever seeing it.

`kerneopgave_sections` got this right in `20260917090000`; this brings
`document_sections` into line.

## Why the function changes too

Referencing `OLD` in an INSERT trigger raises *"record old is not assigned
yet"*, so widening the trigger without rewriting the body would break every
section insert. The body becomes `TG_OP`-aware, and the permission lookup now
happens only when something publish-related actually changed — ordinary draft
edits no longer pay for it.

## Nothing legitimate sets published_content on INSERT

Checked before writing this, because breaking version creation would be a bad
trade:

- `documentService.updateSection` and `useSectionEditor` both insert
  `draft_content` only.
- `create_document_version` has inserted `draft_content` only since
  `20260902090000` — a new version starts unpublished on purpose.
- The superseded `20260901090000` copy *did* carry `published_content` across.
  Its function was replaced twice over, so this is only a reason not to re-run
  that old migration.

Verified after applying:

| | result |
|---|---|
| writer INSERT with `published_content` preset | **refused** |
| writer INSERT with `is_approved = true` | **refused** |
| writer INSERT of an ordinary draft | succeeds |
| writer UPDATE of `published_content` | refused, as before |
| writer edits a draft | succeeds |
| approver INSERT with `published_content` | succeeds |
| approver runs `approve_section` | succeeds |
| writer runs `approve_section` | refused |
| **`create_document_version` by a write-level editor, `copyContent: true`** | **succeeds** |

That last row is the regression that mattered: version creation inserts section
rows as the calling user, so a careless guard would have locked out the very
people the feature is for.

## Run this in the Supabase SQL editor, then create `supabase/migrations/20260920090000-guard-section-publish-on-insert.sql`

```sql
-- Close the INSERT hole in the document_sections publish guard.
--
-- guard_section_publish_trg has been BEFORE UPDATE only since 20260701110410,
-- so the guard catches a writer who edits published_content but not one who
-- creates the row with published_content already set. The row policy for INSERT
-- is can_write_document, so any write-level user could publish arbitrary text by
-- inserting rather than updating, bypassing approve_section entirely.
--
-- kerneopgave_sections got this right in 20260917090000; this brings
-- document_sections into line.
--
-- The function has to become TG_OP-aware first. Referencing OLD in an INSERT
-- trigger raises "record old is not assigned yet", so widening the trigger
-- without rewriting the body would break every section insert.
--
-- Nothing legitimate sets published_content on INSERT, checked before writing
-- this: both client paths (documentService.updateSection and useSectionEditor)
-- insert draft_content only, and create_document_version has inserted only
-- draft_content since 20260902090000 — the new version starts unpublished on
-- purpose. The superseded 20260901090000 copy did carry published_content
-- across, so do not re-run that old migration; its function was replaced twice
-- over.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.guard_section_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Check permission only when something publish-related actually changed, so
  -- ordinary draft edits and inserts do not pay for the lookup.
  IF (NEW.is_approved IS TRUE
        AND (TG_OP = 'INSERT' OR OLD.is_approved IS DISTINCT FROM TRUE))
     OR (TG_OP = 'INSERT' AND NEW.published_content IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.published_content IS DISTINCT FROM OLD.published_content)
  THEN
    IF NOT public.can_approve_document(NEW.document_id, auth.uid()) THEN
      RAISE EXCEPTION 'Only approvers can publish a section';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_section_publish_trg ON public.document_sections;
CREATE TRIGGER guard_section_publish_trg
  BEFORE INSERT OR UPDATE ON public.document_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_section_publish();
```

## After applying

Nothing changes for normal use: editing and saving a section, creating a
version, and approving all behave exactly as before. Confirm one of them, then
confirm the hole is shut — as a non-approver, in the SQL editor:

```sql
insert into public.document_sections (document_id, template_section_id, draft_content, published_content)
values ('<a document you can edit>', '<a template section id>', '{}'::jsonb, '{}'::jsonb);
-- expected: ERROR  Only approvers can publish a section
```
