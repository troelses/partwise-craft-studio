# Lovable prompts — template restructure, kerneopgaver, document versions

Paste these into Lovable **in order**. Each is independently reviewable; later
prompts assume earlier ones landed.

| # | Prompt | What it does |
|---|---|---|
| 1 | `01-template-constants-and-service.md` | Shared template constants; the 7-section structure |
| 2 | `02-per-document-template-resolution.md` | Render each document against its own template; list only current versions |
| 3 | `03-kerneopgaver.md` | Dynamic kerneopgaver items with five fixed sub-sections |
| 4 | `04-document-versions-ui.md` | Versions tab: create a version on a chosen template, promote one to current |
| 5 | `05-richtext-fixes.md` | Two standalone bug fixes in the rich-text layer |

## Apply the SQL first

Prompts 2–4 need these migrations applied, in this order:

1. `supabase/migrations/20260831120000-update-template-add-kerneopgaver.sql` — **already applied**
2. `supabase/migrations/20260901090000-document-versioning.sql` — **already applied**
3. `supabase/migrations/20260902090000-versioning-on-document-access.sql` — **not yet applied**

Verify with `supabase/checks/schema-status.sql` (all rows should read `ok`), then
record what you applied with `supabase/checks/sync-migration-ledger.sql`.

## Regenerate types

After the SQL is applied, regenerate the Supabase TypeScript types. The new
columns (`documents.version_group_id`, `version_number`, `is_current`,
`template_sections.section_key`), the `kerneopgaver` / `kerneopgave_sections`
tables and the new RPCs all need to be present or the code below will not
typecheck cleanly.

**Guardrails — apply to every prompt in this folder:**

- Make only the changes described. Do not refactor, reformat or "improve" anything else.
- Do not change the security model. Do not regenerate or alter RLS policies.
- Do not switch any Supabase client to the `service_role` key. All queries stay caller-scoped so RLS applies.
- Do not modify the MCP integration, the `query-documents` edge function, or `document_access` logic.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.

