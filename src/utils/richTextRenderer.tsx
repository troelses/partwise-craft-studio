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
    <sup className="text-xs text-blue-600 cursor-pointer">
      {ordinal ?? '•'}
    </sup>
  );
};

/** Render one note body (the bespoke NoteRun format) as inline React. */
export const renderNoteRuns = (note: NoteRun[] | undefined): React.ReactNode =>
  (note ?? []).map((run, i) => {
    let el: React.ReactNode = run?.t ?? '';
    for (const mark of run?.m ?? []) {
      if (mark === 'bold') el = <strong key="bold">{el}</strong>;
      else if (mark === 'italic') el = <em key="italic">{el}</em>;
      else if (mark === 'underline') el = <u key="underline">{el}</u>;
      else if (mark === 'strike') el = <del key="strike">{el}</del>;
    }
    const href = safeHref(run?.href);
    if (href) {
      el = (
        <a key="link" href={href} target="_blank" rel="noopener noreferrer">
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
    <div className="mt-8 pt-4 border-t border-gray-200">
      <h3 className="text-lg font-medium mb-3">{title}</h3>
      <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-700">
        {visible.map(entry => (
          <li key={entry.fnId} id={`fn-${entry.fnId}`}>
            {entry.ordinal}. {renderNoteRuns(entry.note)}
          </li>
        ))}
      </ol>
    </div>
  );
};

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  attrs?: Record<string, any>;
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
                <a key="link" href={href} target="_blank" rel="noopener noreferrer">
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

  // Recurse, marking children as “inList” if we’re inside a listItem
  const children = node.content?.map((child, i) =>
    renderTipTapContent(child, i, inList || node.type === 'listItem')
  );

  switch (node.type) {
    case 'doc':
      // Don’t wrap the doc—just render its children
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
