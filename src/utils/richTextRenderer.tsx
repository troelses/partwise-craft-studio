import React from 'react';

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
  // Text + marks (unchanged)…
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
        }
      });
    }
    return <React.Fragment key={index}>{text}</React.Fragment>;
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
      const level = node.attrs?.level || 1;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={index} className={`text-${4 - level}xl font-semibold mb-3`}>
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
