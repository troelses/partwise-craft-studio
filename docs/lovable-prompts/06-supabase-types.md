# Prompt 6 — Regenerate the Supabase TypeScript types

`src/integrations/supabase/types.ts` is generated from the live schema. On main
it is already up to date for `document_access`, `documents.created_by` and the
AI query functions. What it does **not** yet know about is everything added by
the three versioning/kerneopgaver migrations:

| Missing | Added by |
|---|---|
| `documents.version_group_id`, `version_number`, `is_current` | `20260901090000` |
| `template_sections.section_key` | `20260831120000` |
| `kerneopgaver`, `kerneopgave_sections` tables | `20260831120000` |
| `can_manage_document_versions`, `can_publish_document_version`, `create_document_version`, `set_current_document_version` | `20260901090000` + `20260902090000` |

Apply all three migrations **before** regenerating, or the generator will not see
these objects.

Three ways to do it, no Supabase CLI required.

---

## Route A — ask Lovable (simplest)

Lovable owns the Supabase integration for this project and generated the current
file. Ask it to regenerate:

> Regenerate `src/integrations/supabase/types.ts` from the connected Supabase
> project so it reflects the current schema. Do not change any other file.

This picks up everything, including anything added by other sessions. Prefer it.

## Route B — the Management API

Needs only an HTTP client, no Node. Create a personal access token at
**https://supabase.com/dashboard/account/tokens**, then:

```bash
curl -s -H "Authorization: Bearer sbp_YOUR_TOKEN" \
  "https://api.supabase.com/v1/projects/asmgutvwjlwqixxaqcrg/types/typescript"
```

PowerShell, writing straight to the file:

```powershell
$t = "sbp_YOUR_TOKEN"
(Invoke-RestMethod `
  -Uri "https://api.supabase.com/v1/projects/asmgutvwjlwqixxaqcrg/types/typescript" `
  -Headers @{ Authorization = "Bearer $t" }).types |
  Set-Content src/integrations/supabase/types.ts
```

The response is JSON with a `types` field holding the file contents. Treat the
token like a password — it grants management access to the project.

*Note: I could not exercise this endpoint from my environment, so unlike the
patch below it is documented rather than verified.*

## Route C — apply the additions by hand

Exact and verified: each anchor below occurs exactly once in main's current
`types.ts`, and the patched result compiles and typechecks against the code in
prompts 1–4. Use this if A and B are awkward. It covers only the objects listed
at the top — if another session has since changed the schema, prefer Route A.

### 1. `documents` — add three columns

In the **Row** block, find:

```ts
          created_at: string | null
          created_by: string | null
          id: string
          owner_id: string | null
          team_lead_id: string | null
          template_id: string | null
          title: string
          updated_at: string | null
        }
```

Replace with:

```ts
          created_at: string | null
          created_by: string | null
          id: string
          is_current: boolean
          owner_id: string | null
          team_lead_id: string | null
          template_id: string | null
          title: string
          updated_at: string | null
          version_group_id: string
          version_number: number
        }
```

In the **Insert** block (note `title: string` is required there), find:

```ts
          created_at?: string | null
          created_by?: string | null
          id?: string
          owner_id?: string | null
          team_lead_id?: string | null
          template_id?: string | null
          title: string
          updated_at?: string | null
        }
```

Replace with the same list plus `is_current?: boolean` after `id?`, and
`version_group_id?: string` / `version_number?: number` after `updated_at?`.

In the **Update** block (`title?: string`), make the same two additions.

### 2. `template_sections` — add `section_key`

Add `section_key: string | null` after `position: number` in **Row**, and
`section_key?: string | null` in the same place in **Insert** and **Update**.

### 3. Add the two new tables

Insert immediately **before** the `template_sections: {` line (generated types
are alphabetical):

```ts
      kerneopgave_sections: {
        Row: {
          draft_content: Json | null
          id: string
          kerneopgave_id: string
          section_type: string
          updated_at: string
        }
        Insert: {
          draft_content?: Json | null
          id?: string
          kerneopgave_id: string
          section_type: string
          updated_at?: string
        }
        Update: {
          draft_content?: Json | null
          id?: string
          kerneopgave_id?: string
          section_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kerneopgave_sections_kerneopgave_id_fkey"
            columns: ["kerneopgave_id"]
            isOneToOne: false
            referencedRelation: "kerneopgaver"
            referencedColumns: ["id"]
          },
        ]
      }
      kerneopgaver: {
        Row: {
          created_at: string
          document_id: string
          id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kerneopgaver_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
```

### 4. Add the four functions

Immediately after the `Functions: {` line, insert:

```ts
      can_manage_document_versions: {
        Args: { p_user_id: string; p_version_group_id: string }
        Returns: boolean
      }
      can_publish_document_version: {
        Args: { p_user_id: string; p_version_group_id: string }
        Returns: boolean
      }
      create_document_version: {
        Args: {
          p_copy_content?: boolean
          p_source_document_id: string
          p_template_id: string
        }
        Returns: string
      }
      set_current_document_version: {
        Args: { p_document_id: string }
        Returns: undefined
      }
```

---

## Why this matters less than it looks

`tsconfig` has `strict: false` and `noImplicitAny: false`, so stale types
produce silently-loose code rather than build errors — the existing
`kerneopgaverService` already reaches its tables through `as any` casts for this
reason. Regenerating is what removes the need for those casts and makes the new
RPC calls genuinely checked.
