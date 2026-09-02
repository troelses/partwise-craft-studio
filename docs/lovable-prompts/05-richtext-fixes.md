# Prompt 5 — Two rich-text bug fixes

Independent of prompts 1–4; can be applied at any time.

**Guardrails — apply to every prompt in this folder:**

- Make only the changes described. Do not refactor, reformat or "improve" anything else.
- Do not change the security model. Do not regenerate or alter RLS policies.
- Do not switch any Supabase client to the `service_role` key. All queries stay caller-scoped so RLS applies.
- Do not modify the MCP integration, the `query-documents` edge function, or `document_access` logic.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


---

## 1. `src/components/RichTextEditor.tsx` — guard `JSON.parse`

Section content is stored as TipTap JSON. When it is malformed or is plain text,
`JSON.parse` throws during editor construction and takes the whole editor down.

**Find** (around line 48):

```ts
    content: content ? JSON.parse(content) : '',
```

**Replace with:**

```ts
    content: (() => {
      if (!content) return '';
      try {
        return JSON.parse(content);
      } catch {
        // Content is not valid JSON (e.g. legacy plain text). Start empty
        // rather than crashing the editor.
        return '';
      }
    })(),
```

There is a second `JSON.parse(content)` further down (around line 76) inside a
`useEffect`. Wrap that one in `try`/`catch` too, falling back to `''` on failure.

## 2. `src/utils/richTextRenderer.tsx` — heading sizes disappear in production

**Find** (around line 62):

```tsx
        <Tag key={index} className={`text-${4 - level}xl font-semibold mb-3`}>
```

Tailwind scans source for complete class names. `text-${4 - level}xl` is built at
runtime, so those classes are never emitted and headings render unstyled in a
production build. It only appears to work in dev.

**Replace with:**

```tsx
        <Tag key={index} className={`${headingSizeClass[level] ?? 'text-base'} font-semibold mb-3`}>
```

**And add this lookup near the top of the file, above the component:**

```ts
// Static class names so Tailwind can see them; a template literal built at
// runtime gets purged from the production stylesheet.
const headingSizeClass: Record<number, string> = {
  1: 'text-3xl',
  2: 'text-2xl',
  3: 'text-xl',
  4: 'text-lg',
  5: 'text-base',
  6: 'text-sm',
};
```
