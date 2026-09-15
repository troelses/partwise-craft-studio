# Prompt 24 — kerneopgave subsections get a published version

**Stage B** of `docs/kerneopgaver-approval-scope.md`. Requires prompt 23.
One migration and one small service change.

**Guardrails:**

- Run the SQL in the Supabase SQL editor first, then create the file and apply
  the code change.
- Make only the changes described.

---

## What this adds

`published_content`, `is_approved`, `approved_by` and `approved_at` on
`kerneopgave_sections` — the columns an approval writes into. The approve path
itself is Stage C; nothing approves kerneopgaver yet after this prompt.

Existing rows start with `published_content` NULL and `is_approved` false, which
is the correct state: nothing in section 2.2 has ever been approved.

## The trigger is the point, not a formality

The write policy on `kerneopgave_sections` is `FOR ALL`. Without a guard, any
user with write-level access could set `published_content` themselves and bypass
approval completely — the column would be a hole rather than a feature.
`document_sections` has had `guard_section_publish_trg` for this reason since
`20260701110410`; this mirrors it.

Verified on PostgreSQL 16, with a write-level user and an approver:

| attempt, as a write-level user | result |
|---|---|
| `UPDATE … SET published_content = …` | **refused** |
| `UPDATE … SET is_approved = true` | **refused** |
| `INSERT` with `published_content` already set | **refused** |
| ordinary draft edit | succeeds |
| the same publish, as an approver | succeeds |

**One deliberate difference from the original.** This guards `INSERT` as well as
`UPDATE`. The `document_sections` guard is `BEFORE UPDATE` only, so a writer can
create a row there with `published_content` already set. That hole is still open
on `document_sections` — I have not closed it here, because tightening a table
this work did not otherwise touch is your decision, not mine. It is recorded in
the scope.

## 1. Run this in the Supabase SQL editor, then create `supabase/migrations/20260917090000-kerneopgave-publish-columns.sql`

```sql
-- Give kerneopgave subsections a published version, and guard it.
--
-- Stage B of docs/kerneopgaver-approval-scope.md. kerneopgave_sections has only
-- draft_content, so section 2.2 cannot be approved and never reaches search or
-- Ask AI — 58% of the text in the real documents. These columns are what an
-- approval writes into; the approve path itself is Stage C.
--
-- The trigger is the security-critical half, not a formality. The write policy
-- on kerneopgave_sections is FOR ALL, so without it any user with write-level
-- access could set published_content themselves and bypass approval entirely.
-- document_sections has had guard_section_publish_trg for exactly this reason
-- since 20260701110410, and this mirrors it.
--
-- One deliberate difference: this guards INSERT as well as UPDATE. The
-- document_sections guard is BEFORE UPDATE only, so a writer can create a row
-- with published_content already set. That same hole is therefore still open on
-- document_sections; closing it is a separate decision and is noted in the
-- scope rather than changed here.
--
-- Additive and idempotent. Existing rows get published_content NULL and
-- is_approved false, which is the correct starting state: nothing in section 2.2
-- has ever been approved.

ALTER TABLE public.kerneopgave_sections
  ADD COLUMN IF NOT EXISTS published_content jsonb,
  ADD COLUMN IF NOT EXISTS is_approved       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by       uuid,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz;

CREATE OR REPLACE FUNCTION public.guard_kerneopgave_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc uuid;
BEGIN
  -- Only look the document up when something publish-related actually changed,
  -- so ordinary draft edits do not pay for the join.
  IF (NEW.is_approved IS TRUE AND (TG_OP = 'INSERT' OR OLD.is_approved IS DISTINCT FROM TRUE))
     OR (TG_OP = 'INSERT' AND NEW.published_content IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.published_content IS DISTINCT FROM OLD.published_content)
  THEN
    SELECT k.document_id INTO v_doc
      FROM public.kerneopgaver k
     WHERE k.id = NEW.kerneopgave_id;

    IF v_doc IS NULL OR NOT public.can_approve_document(v_doc, auth.uid()) THEN
      RAISE EXCEPTION 'Only approvers can publish a kerneopgave section';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_kerneopgave_publish_trg ON public.kerneopgave_sections;
CREATE TRIGGER guard_kerneopgave_publish_trg
  BEFORE INSERT OR UPDATE ON public.kerneopgave_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_kerneopgave_publish();
```

## 2. `src/services/kerneopgaverService.ts` — editing clears the approval

Without this, an edited subsection would keep reading as approved while its
published text was the older version, and would never reappear for review.
`documentService.updateSection` already does exactly this for ordinary sections.

Find:

```ts
    const { error } = await supabase
      .from('kerneopgave_sections')
      .update({ draft_content: parsed, updated_at: new Date().toISOString() })
      .eq('id', sectionId);
```

Replace with:

```ts
    // Editing clears the approval, exactly as documentService.updateSection does
    // for an ordinary section. Without this an edited subsection would keep
    // reading as approved while its published text was the older version, and it
    // would never reappear in the approval dashboard.
    const { error } = await supabase
      .from('kerneopgave_sections')
      .update({
        draft_content: parsed,
        is_approved: false,
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sectionId);
```

---

## After applying

`npx tsc -p tsconfig.app.json --noEmit`. Nothing changes visibly yet — the
columns exist and are guarded, but nothing writes to them until Stage C.

Worth confirming directly in the SQL editor as a non-approver, since this is the
security-critical half:

```sql
update public.kerneopgave_sections set published_content = '{}'::jsonb
 where id = '<some id>';
-- expected: ERROR  Only approvers can publish a kerneopgave section
```
