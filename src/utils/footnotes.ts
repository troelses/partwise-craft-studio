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
 *    them (migration 20260903090000).
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
