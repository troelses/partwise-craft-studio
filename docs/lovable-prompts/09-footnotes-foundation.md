# Prompt 9 — Footnotes, part 1: data model and renderer

First of two prompts adding footnotes to section text. This one adds no visible
feature on its own; it puts the data model in place and fixes two marks the
renderer currently drops. Apply prompt 10 straight after.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- Do not touch the MCP integration, `query-documents`, or `document_access` logic.
- Where a whole file is given, replace the file's entire contents with exactly what is shown.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


---

## Why the footnote format looks the way it does

A footnote's body is stored in `attrs.note`, in a small bespoke run format whose
keys are `t` / `m` / `href` — deliberately **never** `text`.

The database function behind search and Ask AI, `tiptap_to_text`, harvests every
value under a key named `text` at any depth (`strict $.**.text`). Had the note
body been ordinary TipTap `text` nodes, footnotes would have begun splicing
themselves mid-sentence into the AI's view the moment the first section
containing one was approved — before any migration shipped. Verified against the
live function: with this format the flattener returns
`"Behandling foregår ambulant.  Herefter afsluttes."`, and with `text` nodes it
returns `"Behandling foregår ambulant. Sundhedsstyrelsen 2024  Herefter afsluttes."`

So footnotes are invisible to search until the SQL is deliberately updated —
this fails closed rather than corrupting text in production.

## 1. Create `src/utils/footnotes.ts`

New file, exactly:

```ts
/**
 * Footnotes.
 *
 * A footnote is an inline atom node in the section's TipTap document:
 *
 *   { "type": "footnote",
 *     "attrs": {
 *       "fnId": "9f2c8a1e-…",
 *       "note": [
 *         { "t": "Sundhedsstyrelsen, " },
 *         { "t": "Specialeplan 2024", "m": ["italic"], "href": "https://…" }
 *       ]
 *     } }
 *
 * Two deliberate choices, both load-bearing:
 *
 * 1. The note body lives in `attrs.note` as this bespoke run format, and NO key
 *    anywhere in it is called `text`. The database flattener behind search and
 *    Ask AI is `tiptap_to_text`, which harvests every value keyed `text` at any
 *    depth (`strict $.**.text`). Had the body used ordinary TipTap `text` nodes,
 *    footnotes would start splicing themselves mid-sentence into the AI's view
 *    the moment the first section containing one was approved — before any
 *    migration had shipped. This format fails closed instead: footnotes are
 *    simply invisible to search until the SQL is deliberately updated to read
 *    `$.**.t` as well.
 *
 * 2. The visible number is never stored. Numbering is continuous across the
 *    whole document, and sections are independent editors saved independently,
 *    so a stored ordinal would go stale as soon as a footnote was inserted in an
 *    earlier section. `fnId` is the stable identity; the ordinal is derived at
 *    render and export time by `buildNumbering`.
 */

export type NoteMark = 'bold' | 'italic' | 'underline' | 'strike';

/** One run of footnote text. `t` is always the displayed text — for a link,
 *  `t` is the label and `href` the target, so the two can differ. */
export interface NoteRun {
  t: string;
  m?: NoteMark[];
  href?: string;
}

export interface FootnoteAttrs {
  fnId: string;
  note: NoteRun[];
}

export interface FootnoteEntry {
  fnId: string;
  /** 1-based position across the whole document, in section order. */
  ordinal: number;
  note: NoteRun[];
}

export const FOOTNOTE_NODE = 'footnote';

export const newFnId = (): string => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback for older browsers; uniqueness only has to hold within a document.
  return `fn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** The parts of a TipTap node this module inspects. Deliberately loose: the
 *  documents come from the editor and from imported files, so anything not
 *  recognised is simply walked through. */
export interface TipTapNodeLike {
  type?: string;
  content?: TipTapNodeLike[];
  text?: string;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

/** Accepts the TipTap doc as either a JSON string or an already-parsed object,
 *  matching how section content is passed around the app. Never throws. */
export const parseDoc = (content: unknown): TipTapNodeLike | null => {
  if (!content) return null;
  if (typeof content === 'object') return content as TipTapNodeLike;
  if (typeof content !== 'string') return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

const walk = (node: TipTapNodeLike, visit: (n: TipTapNodeLike) => void): void => {
  if (!node || typeof node !== 'object') return;
  visit(node);
  const children = Array.isArray(node.content) ? node.content : [];
  for (const child of children) walk(child, visit);
};

/**
 * Collect every footnote across the given section documents, in document order.
 * Pass the section contents already sorted by section order — this function
 * preserves the order it is given and does not sort.
 *
 * Duplicate ids (which copy-paste can produce) are numbered once, at their first
 * appearance, so numbering never skips or repeats.
 */
export const collectFootnotes = (contents: unknown[]): FootnoteEntry[] => {
  const entries: FootnoteEntry[] = [];
  const seen = new Set<string>();

  for (const content of contents) {
    const doc = parseDoc(content);
    if (!doc) continue;

    walk(doc, node => {
      if (node.type !== FOOTNOTE_NODE) return;
      const fnId = node.attrs?.fnId;
      if (typeof fnId !== 'string' || !fnId || seen.has(fnId)) return;
      seen.add(fnId);
      entries.push({
        fnId,
        ordinal: entries.length + 1,
        note: Array.isArray(node.attrs?.note) ? node.attrs.note : [],
      });
    });
  }

  return entries;
};

/** `fnId` -> 1-based ordinal, for the whole document. */
export const buildNumbering = (contents: unknown[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const entry of collectFootnotes(contents)) {
    map.set(entry.fnId, entry.ordinal);
  }
  return map;
};

const MARK_ORDER: NoteMark[] = ['bold', 'italic', 'underline', 'strike'];

const isNoteMark = (value: unknown): value is NoteMark =>
  typeof value === 'string' && (MARK_ORDER as string[]).includes(value);

/**
 * The note body is edited in a small nested TipTap instance, so it has to
 * convert both ways between the stored run format and a TipTap document.
 * Only inline content survives: a note is a single paragraph of marked text.
 */
export const noteRunsToTipTapDoc = (note: NoteRun[] | undefined): TipTapNodeLike => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: (note ?? [])
        .filter(run => (run?.t ?? '') !== '')
        .map(run => {
          const marks: Array<{ type: string; attrs?: Record<string, unknown> }> = [];
          for (const mark of run.m ?? []) {
            if (MARK_ORDER.includes(mark)) marks.push({ type: mark });
          }
          if (run.href) marks.push({ type: 'link', attrs: { href: run.href } });
          return marks.length > 0
            ? { type: 'text', text: run.t, marks }
            : { type: 'text', text: run.t };
        }),
    },
  ],
});

export const tipTapDocToNoteRuns = (doc: unknown): NoteRun[] => {
  const parsed = parseDoc(doc);
  if (!parsed) return [];

  const runs: NoteRun[] = [];
  walk(parsed, node => {
    if (node.type !== 'text' || typeof node.text !== 'string' || node.text === '') return;

    const marks: NoteMark[] = [];
    let href: string | undefined;
    for (const mark of node.marks ?? []) {
      if (mark?.type === 'link') {
        const value = mark.attrs?.href;
        if (typeof value === 'string' && value) href = value;
      } else if (isNoteMark(mark?.type)) {
        marks.push(mark.type);
      }
    }

    const run: NoteRun = { t: node.text };
    if (marks.length > 0) run.m = marks;
    if (href) run.href = href;
    runs.push(run);
  });

  return runs;
};

/** Flatten a note body to plain text — used by the PDF export and anywhere a
 *  string is needed. Link runs contribute their display text, not the URL. */
export const noteRunsToPlainText = (note: NoteRun[] | undefined): string =>
  (note ?? []).map(run => run?.t ?? '').join('');

/** True when the note has no visible text, so empty footnotes can be skipped
 *  rather than rendered as a dangling marker. */
export const isEmptyNote = (note: NoteRun[] | undefined): boolean =>
  noteRunsToPlainText(note).trim().length === 0;
```

## 2. Replace `src/utils/richTextRenderer.tsx`

Replace the **whole file**. Alongside the new footnote handling this fixes two
existing bugs: the editor has an underline button but the renderer dropped the
`underline` mark, and there was no `link` mark case at all. Link targets are
passed through a scheme allow-list because imported Word documents are untrusted
input.

```tsx
import React from 'react';
import {
  FOOTNOTE_NODE,
  NoteRun,
  FootnoteEntry,
  isEmptyNote,
} from '@/utils/footnotes';

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

/**
 * Footnote numbering is continuous across the whole document, but this renderer
 * is called once per section. The ordinal therefore arrives through context,
 * supplied above the section loop, rather than being threaded through six call
 * sites. Without a provider, markers fall back to a bullet.
 */
export const FootnoteNumberingContext = React.createContext<Map<string, number> | null>(null);

/** Only allow schemes that are safe to put in an href. Link targets can come
 *  from imported Word documents, so `javascript:` and friends are rejected. */
const safeHref = (href: unknown): string | null => {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  // Protocol-relative and bare domains are treated as https.
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
};

const FootnoteMarker: React.FC<{ fnId: string }> = ({ fnId }) => {
  const numbering = React.useContext(FootnoteNumberingContext);
  const ordinal = numbering?.get(fnId);
  return (
    <sup
      id={`fnref-${fnId}`}
      className="text-blue-700 font-medium ml-0.5 cursor-default"
      title="Fodnote"
    >
      {ordinal ?? '•'}
    </sup>
  );
};

/** Render one note body (the bespoke NoteRun format) as inline React. */
export const renderNoteRuns = (note: NoteRun[] | undefined): React.ReactNode =>
  (note ?? []).map((run, i) => {
    let el: React.ReactNode = run?.t ?? '';
    for (const mark of run?.m ?? []) {
      if (mark === 'bold') el = <strong>{el}</strong>;
      else if (mark === 'italic') el = <em>{el}</em>;
      else if (mark === 'underline') el = <u>{el}</u>;
      else if (mark === 'strike') el = <del>{el}</del>;
    }
    const href = safeHref(run?.href);
    if (href) {
      el = (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 underline break-words"
        >
          {el}
        </a>
      );
    }
    return <React.Fragment key={i}>{el}</React.Fragment>;
  });

/** The collected notes, rendered as a numbered list. Render once per document,
 *  below the sections. */
export const FootnoteList: React.FC<{ entries: FootnoteEntry[]; title?: string }> = ({
  entries,
  title = 'Noter',
}) => {
  const visible = entries.filter(e => !isEmptyNote(e.note));
  if (visible.length === 0) return null;

  return (
    <section className="mt-10 pt-4 border-t border-gray-300">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
      <ol className="text-sm text-gray-700 space-y-1">
        {visible.map(entry => (
          <li key={entry.fnId} id={`fn-${entry.fnId}`} className="flex gap-2">
            <span className="text-blue-700 font-medium shrink-0">{entry.ordinal}.</span>
            <span>{renderNoteRuns(entry.note)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
}

const renderTipTapContent = (
  node: TipTapNode,
  index: number,
  inList = false
): React.ReactNode => {
  // Text + marks
  if (node.type === 'text') {
    let text: React.ReactNode = node.text || '';
    if (node.marks) {
      node.marks.forEach((mark) => {
        switch (mark.type) {
          case 'bold':
            text = <strong key="bold">{text}</strong>;
            break;
          case 'italic':
            text = <em key="italic">{text}</em>;
            break;
          case 'strike':
            text = <del key="strike">{text}</del>;
            break;
          case 'underline':
            text = <u key="underline">{text}</u>;
            break;
          case 'link': {
            const href = safeHref(mark.attrs?.href);
            if (href) {
              text = (
                <a
                  key="link"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline break-words"
                >
                  {text}
                </a>
              );
            }
            break;
          }
        }
      });
    }
    return <React.Fragment key={index}>{text}</React.Fragment>;
  }

  // A footnote is an atom: its body lives in attrs, not in content, so it must
  // be handled before the generic recursion below.
  if (node.type === FOOTNOTE_NODE) {
    const fnId = node.attrs?.fnId;
    if (typeof fnId !== 'string' || !fnId) return null;
    return <FootnoteMarker key={index} fnId={fnId} />;
  }

  // Recurse, marking children as "inList" if we're inside a listItem
  const children = node.content?.map((child, i) =>
    renderTipTapContent(child, i, inList || node.type === 'listItem')
  );

  switch (node.type) {
    case 'doc':
      // Don't wrap the doc—just render its children
      return <React.Fragment key={index}>{children}</React.Fragment>;

    case 'paragraph':
      // Smaller bottom margin inside lists
      return (
        <p
          key={index}
          className={inList ? 'mb-1' : 'mb-4'}
        >
          {children}
        </p>
      );

    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={index} className={`${headingSizeClass[level] ?? 'text-base'} font-semibold mb-3`}>
          {children}
        </Tag>
      );
    }

    case 'bulletList':
      return (
        <ul key={index} className="list-disc pl-6 mb-4">
          {children}
        </ul>
      );

    case 'orderedList':
      return (
        <ol key={index} className="list-decimal pl-6 mb-4">
          {children}
        </ol>
      );

    case 'listItem':
      return (
        <li key={index} className="mb-1">
          {children}
        </li>
      );

    case 'blockquote':
      return (
        <blockquote key={index} className="border-l-4 border-gray-300 pl-4 italic text-gray-700 mb-4">
          {children}
        </blockquote>
      );

    case 'hardBreak':
      return <br key={index} />;

    default:
      // Fallback for any unrecognized node types
      return <div key={index}>{children}</div>;
  }
};

export const renderRichText = (jsonContent: string | object): React.ReactNode => {
  if (!jsonContent) return null;

  try {
    const parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;
    // Dive into the doc node itself
    return renderTipTapContent(parsed as TipTapNode, 0, false);
  } catch {
    // Plain-text fallback
    const text = typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent);
    return <p className="whitespace-pre-wrap">{text}</p>;
  }
};
```
