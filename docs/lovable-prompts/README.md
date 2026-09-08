# Lovable prompts — template restructure, kerneopgaver, document versions

Each prompt is independently reviewable; later prompts assume earlier ones
landed. Three migrations interleave with them — see **Order to apply** below,
which is the list to work from. The table is a contents page, not the order.

**Lovable never applies SQL.** Where a prompt says "create
`supabase/migrations/<file>`", that records the file in the repo so version
control describes the schema; it does not run anything. Every migration is run by
hand in the Supabase SQL editor. The failure mode is silent — the app builds fine
and the schema is simply unchanged.

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

## Order to apply

Prompts 1–8 are done. This is what remains, in order:

| # | Step | Where |
|---|---|---|
| 1 | `20260903090000-footnotes-in-tiptap-to-text.sql` | Supabase SQL editor |
| 2 | `20260903120000-intern-medicin-template.sql` | Supabase SQL editor |
| 3 | `supabase/checks/sync-migration-ledger.sql`, once | Supabase SQL editor |
| 4 | Prompts 9 → 10 → 11 | Lovable |
| 5 | Spot check on screen — see below | the app |
| 6 | Prompts 12 → 13 → 14 | Lovable |
| 7 | Prompt 6 — regenerate the Supabase types | Lovable |
| 8 | `20260904090000-inherit-legacy-permissions-on-version.sql` | Supabase SQL editor |
| 9 | Prompt 15 | Lovable |

Two constraints in that list are not cosmetic:

- **Prompt 14 needs prompt 13.** The parser imports
  `src/constants/kerneopgaver.ts`, which prompt 13 creates.
- **Step 8 must precede prompt 15.** Prompt 15's pre-flight guard counts a
  `can_edit` row on the source document as sufficient, which only becomes true
  once that migration lands. Applied the other way round, the guard waves through
  an import that RLS then refuses part-way — after every section has already been
  written, leaving a half-imported version.

Step 5 is worth not skipping: prompt 11 is the first time kerneopgaver and
continuous footnote numbering reach the screen. Insert a footnote with a link,
save and reload it; add one to an earlier section and confirm the later ordinals
shift; export to Word and check section 2.2 carries the kerneopgaver. An error
there is far cheaper to find on one hand-authored document than after importing
thirteen.

## Status

Prompts 1–8 have been applied. Three migrations are live on the Supabase project
— `20260831120000`, `20260901090000` and `20260902090000` (verified:
`schema-status.sql` reports `ok` on all 14 rows).

Three are **not** yet applied: `20260903090000`, `20260903120000` and
`20260904090000`. They are steps 1, 2 and 8 above.

Prompts 7 and 8 were bookkeeping — they added the already-applied SQL to the repo
so version control describes the real schema. They added files only and changed
no running code; **the SQL in them must not be executed again.**

## Regenerate types

Regenerate the Supabase TypeScript types after any migration that changes a table
or a column — see `06-supabase-types.md`, which covers three ways to do it
without the Supabase CLI. Step 7 above is the point in this sequence where it
matters, because prompts 12–14 read columns the generated types must already
know about.

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
