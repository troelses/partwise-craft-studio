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
| 6 | `06-supabase-types.md` | Regenerate the Supabase types (three routes, no CLI needed) |
| 7 | `07-record-migrations.md` | Commit the three applied migrations so the repo records the schema |
| 8 | `08-schema-checks.md` | Commit the two verification scripts |
| 9 | `09-footnotes-foundation.md` | Footnotes part 1: data model, renderer, link + underline mark fixes |
| 10 | `10-footnotes-authoring.md` | Footnotes part 2: authoring, links with display text, continuous numbering |
| 11 | `11-export-kerneopgaver-and-footnotes.md` | Export: kerneopgaver included, real Word footnotes, approved/draft variants |
| 12 | `12-footnotes-in-search-and-ai.md` | Footnote text reaches full-text search and Ask AI, labelled (+ mandatory REINDEX) |
| 13 | `13-intern-medicin-template.md` | Second template for the Intern medicin specialties; kerneopgave constants extracted |
| 14 | `14-docx-import-parser.md` | .docx import part 1: the parser (no UI, no database access) |
| 15 | `15-docx-import-write.md` | .docx import part 2: import dialog, write path, and the permissions migration it needs |

## Status

Prompts 1–6 have been applied, and all three migrations are live on the Supabase
project (verified: `schema-status.sql` reports `ok` on all 14 rows).

Prompts 7 and 8 are bookkeeping — they add the already-applied SQL to the repo so
version control describes the real schema. They add files only and change no
running code; **the SQL in them must not be executed again.**

## Regenerate types

After the SQL is applied, regenerate the Supabase TypeScript types — see
`06-supabase-types.md`, which covers three ways to do it without the Supabase
CLI. Do this before or alongside prompt 4.

**Guardrails — apply to every prompt in this folder:**

- Make only the changes described. Do not refactor, reformat or "improve" anything else.
- Do not change the security model. Do not regenerate or alter RLS policies.
- Do not switch any Supabase client to the `service_role` key. All queries stay caller-scoped so RLS applies.
- Do not modify the MCP integration, the `query-documents` edge function, or `document_access` logic.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


## Typechecking this repo

`npx tsc --noEmit` checks **nothing** here: the root `tsconfig.json` has
`files: []` and only project references, so it type-checks an empty program and
exits 0 regardless. Use `npx tsc -p tsconfig.app.json --noEmit` (and
`tsconfig.node.json` for the Vite config). `npm run build` does not typecheck
either — Vite transpiles without checking.
