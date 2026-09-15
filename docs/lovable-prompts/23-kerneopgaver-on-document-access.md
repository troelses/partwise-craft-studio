# Prompt 23 — kerneopgaver move onto `document_access`

SQL only. No code change. This is **Stage A** of
`docs/kerneopgaver-approval-scope.md`, and the prerequisite for the rest of it.

**Guardrails:**

- Run the SQL in the Supabase SQL editor, then create the file so the repo
  records it. Creating the file does not execute anything.
- Read the NOTICE the migration prints before deciding to keep it.

---

## What is wrong

The kerneopgave policies grant read through `user_permissions.can_view` and
write through `user_permissions.can_edit`. Every other table — `document_sections`
included — moved to `document_access` long ago.

Reproduced on PostgreSQL 16 with the real policies and six kinds of user. The
"before" column is today's behaviour:

| user | grant | before | after |
|---|---|---|---|
| modern **write** grant | `document_access = 'write'` | 1 section, **0 kerneopgaver** | 1 section, 1 kerneopgave |
| modern **view** grant + legacy `can_view` | both | 1 section, 1 kerneopgave | unchanged |
| **legacy only** | `user_permissions` only | **0 sections**, 1 kerneopgave | 0 sections, 0 kerneopgaver |
| admin | — | 1 section, 1 kerneopgave | unchanged |
| team lead | `team_lead_id` | 0 sections, 1 kerneopgave | unchanged |
| no access | — | 0, 0 | unchanged |

Two things to read out of that table.

**Section 2.2 is invisible today to anyone granted access the modern way.** The
first row is the defect: a user who can see and edit every other section of a
document sees no kerneopgaver at all.

**The reverse case is already incoherent, not useful.** The third row shows a
legacy-only user seeing kerneopgaver and *nothing else* — `document_sections` is
gated entirely on `document_access`, so they cannot see any ordinary section.
This migration ends that split rather than taking away coherent access.

## What it changes

- Read: `has_document_access`. Write: `can_write_document`. The same helpers
  `document_sections` uses.
- **Adds the `WITH CHECK` the legacy write policy lacked.** A `FOR ALL` policy
  with only `USING` does not constrain `INSERT`, so today an editor can insert
  kerneopgaver into a document they have no rights to. Verified before and after:
  that insert now fails.
- Admin and team-lead policies are left alone. `team_lead_id` is not a
  `document_access` grant, and a team lead must keep working.

## Before you keep it

The migration prints a NOTICE with the number of user/document pairs holding a
legacy permission and no `document_access` grant — the people in row three. On
the test fixture it read:

```
NOTICE:  1 user/document pair(s) hold a legacy permission but no document_access
grant. They lose kerneopgave visibility here, and already could not see the
document's other sections.
```

If that number is 0 on your project, nobody is affected at all. If it is not,
those users need a `document_access` grant — which is what they should have had.

## 1. Run this in the Supabase SQL editor, then create `supabase/migrations/20260916090000-kerneopgaver-on-document-access.sql`

```sql
-- Put kerneopgaver on the same permission model as everything else.
--
-- The kerneopgave policies grant read through user_permissions.can_view and
-- write through user_permissions.can_edit, while document_sections and every
-- other table moved to document_access. Verified on PostgreSQL 16 with the real
-- policies: a user holding document_access 'approve' and no legacy row sees
-- ZERO kerneopgaver, while a user with a legacy can_view row sees them. So
-- section 2.2 is invisible today to anyone granted access the modern way.
--
-- The reverse case is already incoherent rather than useful: document_sections
-- is gated entirely on document_access, so a user holding only legacy rows can
-- see none of the document's ordinary sections. They see kerneopgaver and
-- nothing else. This migration ends that split rather than taking away coherent
-- access.
--
-- It also adds the WITH CHECK that the legacy write policy lacked. A FOR ALL
-- policy with only USING does not constrain INSERT, so the old rules let an
-- editor insert kerneopgaver into a document they had no rights to.
--
-- Admin and team-lead policies are deliberately left alone: team_lead_id is not
-- a document_access grant, and a team lead must keep working.
--
-- Idempotent; safe to re-run.

-- Report who this affects before changing anything. Shown as a NOTICE in the
-- SQL editor output.
DO $$
DECLARE
  v_legacy_only integer;
BEGIN
  SELECT count(*) INTO v_legacy_only
    FROM (
      SELECT DISTINCT up.user_id, up.document_id
        FROM public.user_permissions up
       WHERE (up.can_view OR up.can_edit)
         AND NOT EXISTS (
           SELECT 1 FROM public.document_access da
            WHERE da.user_id = up.user_id
              AND da.document_id::text = up.document_id
         )
    ) AS legacy_only;

  RAISE NOTICE '% user/document pair(s) hold a legacy permission but no document_access grant. They lose kerneopgave visibility here, and already could not see the document''s other sections.', v_legacy_only;
END $$;

-- kerneopgaver -----------------------------------------------------------------
DROP POLICY IF EXISTS "Editors can manage kerneopgaver" ON public.kerneopgaver;
DROP POLICY IF EXISTS "Viewers can read kerneopgaver"   ON public.kerneopgaver;

DROP POLICY IF EXISTS "Read kerneopgaver by access" ON public.kerneopgaver;
CREATE POLICY "Read kerneopgaver by access"
  ON public.kerneopgaver FOR SELECT
  USING (public.has_document_access(document_id, auth.uid()));

DROP POLICY IF EXISTS "Write kerneopgaver (write+)" ON public.kerneopgaver;
CREATE POLICY "Write kerneopgaver (write+)"
  ON public.kerneopgaver FOR ALL
  USING (public.can_write_document(document_id, auth.uid()))
  WITH CHECK (public.can_write_document(document_id, auth.uid()));

-- kerneopgave_sections ---------------------------------------------------------
DROP POLICY IF EXISTS "Editors can manage kerneopgave_sections" ON public.kerneopgave_sections;
DROP POLICY IF EXISTS "Viewers can read kerneopgave_sections"   ON public.kerneopgave_sections;

DROP POLICY IF EXISTS "Read kerneopgave_sections by access" ON public.kerneopgave_sections;
CREATE POLICY "Read kerneopgave_sections by access"
  ON public.kerneopgave_sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
       WHERE k.id = kerneopgave_sections.kerneopgave_id
         AND public.has_document_access(k.document_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "Write kerneopgave_sections (write+)" ON public.kerneopgave_sections;
CREATE POLICY "Write kerneopgave_sections (write+)"
  ON public.kerneopgave_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
       WHERE k.id = kerneopgave_sections.kerneopgave_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.kerneopgaver k
       WHERE k.id = kerneopgave_sections.kerneopgave_id
         AND public.can_write_document(k.document_id, auth.uid())
    )
  );
```

## After applying

1. As a user with a plain write grant and no legacy row, open a document: section
   2.2 should now show its kerneopgaver. This is the defect being fixed, so it is
   the one worth checking on a real account rather than assuming.
2. The editor, the read view, the import dialog and the exporter all read these
   tables through the same client, so all four follow automatically.
3. Re-running the migration is safe — every policy is dropped by name first.
