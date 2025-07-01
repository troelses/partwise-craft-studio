
import React from 'react';

interface TipTapNode {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  attrs?: Record<string, any>;
}

const renderTipTapContent = (node: TipTapNode): React.ReactNode => {
  if (node.type === 'text') {
    let text: React.ReactNode = node.text || '';
    
    if (node.marks) {
      node.marks.forEach(mark => {
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
    
    return text;
  }
  
  const children = node.content?.map((child, index) => (
    <React.Fragment key={index}>
      {renderTipTapContent(child)}
    </React.Fragment>
  ));
  
  switch (node.type) {
    case 'paragraph':
      return <p className="mb-4">{children}</p>;
    case 'heading':
      const level = node.attrs?.level || 1;
      const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
      return <HeadingTag className={`text-${4-level}xl font-semibold mb-3`}>{children}</HeadingTag>;
    case 'bulletList':
      return <ul className="list-disc pl-6 mb-4">{children}</ul>;
    case 'orderedList':
      return <ol className="list-decimal pl-6 mb-4">{children}</ol>;
    case 'listItem':
      return <li className="mb-1">{children}</li>;
    case 'blockquote':
      return <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-700 mb-4">{children}</blockquote>;
    case 'hardBreak':
      return <br />;
    default:
      return <div>{children}</div>;
  }
};

export const renderRichText = (jsonContent: string | object): React.ReactNode => {
  if (!jsonContent) return null;
  
  try {
    let parsed;
    
    // Handle both string and object inputs
    if (typeof jsonContent === 'string') {
      parsed = JSON.parse(jsonContent);
    } else {
      parsed = jsonContent;
    }
    
    if (parsed.content) {
      return parsed.content.map((node: TipTapNode, index: number) => (
        <React.Fragment key={index}>
          {renderTipTapContent(node)}
        </React.Fragment>
      ));
    }
  } catch (error) {
    // If JSON parsing fails, treat as plain text
    const textContent = typeof jsonContent === 'string' ? jsonContent : JSON.stringify(jsonContent);
    return <p className="whitespace-pre-wrap">{textContent}</p>;
  }
  
  return null;
};
