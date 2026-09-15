# Prompt 17 — fix: templates are invisible to every logged-in user

SQL only. No code change.

**Guardrails:**

- Run the SQL in the Supabase SQL editor, then create the file so the repo
  records it. Creating the file does not execute anything.
- Change nothing else about RLS.

---

## What is wrong

After prompt 16 the import dialog fetches templates correctly, and reports
"Ingen skabeloner fundet" — the query runs and comes back with **zero rows**.

`public.templates` has row-level security enabled and **no SELECT policy**, so it
returns nothing to any authenticated user. Reproduced on PostgreSQL 16: with RLS
on and no policy, `templates` yields 0 rows while `template_sections` yields its
rows normally. That asymmetry is exactly what you see — documents render fine,
because four call sites read `template_sections`, while the one call site that
reads `templates` gets nothing.

**This is not new, and not caused by the importer.** `templateService.getTemplates()`
is the only reader of that table in the whole application, and it arrived with the
Versions tab in prompt 4. The "New version" dialog preselects the current
template, so its empty list looks populated until you open the dropdown — which is
why this went unnoticed until the import dialog forced a real choice.

## What this grants, and what it does not

Strictly less than the app already exposes. `template_sections` — the actual
contents of every template, section names and all — is readable by any
authenticated user today. This adds only the parent row's name and description.

Writes stay closed. With RLS enabled and no INSERT/UPDATE/DELETE policy, no
client can create, rename or delete a template; they are created by migration.
Verified on the harness after applying: SELECT returns the rows, INSERT is
refused outright, UPDATE and DELETE affect zero rows.

## 1. Run this in the Supabase SQL editor, then create `supabase/migrations/20260915090000-templates-readable.sql`

```sql
-- Let authenticated users list the templates.
--
-- public.templates has row-level security enabled but no SELECT policy, so the
-- table returns zero rows to every logged-in user. Reproduced on PostgreSQL 16:
-- with RLS on and no policy, `templates` yields 0 rows while `template_sections`
-- still yields its rows -- which is exactly the observed behaviour, documents
-- rendering normally while both template pickers sit empty.
--
-- The table has a single reader in the whole application,
-- templateService.getTemplates(), so nothing else ever exercised the gap. It has
-- been there since the Versions tab shipped: that dialog preselects the current
-- template, so an empty list looks populated until it is opened.
--
-- This grants strictly less than the app already exposes. template_sections --
-- the actual contents of every template, section names and all -- is readable by
-- any authenticated user today; this adds only the parent row's name and
-- description. Writes stay closed: templates are created by migration, and with
-- RLS enabled and no INSERT/UPDATE/DELETE policy, no client can change them.
--
-- Idempotent; safe to re-run.

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.templates;
CREATE POLICY "Authenticated users can read templates"
  ON public.templates
  FOR SELECT
  TO authenticated
  USING (true);
```

## After applying

1. Open **Importér fra Word**: both templates are listed —
   `specialebeskrivelse_310826` and `specialebeskrivelse_intern_medicin` — with
   the current version's template preselected. The "Ingen skabeloner fundet"
   message is gone.
2. Open **New version**: its dropdown now lists templates too, rather than
   showing a preselected value over an empty list.
3. Re-running the migration is safe — it drops the policy by name before
   creating it.
