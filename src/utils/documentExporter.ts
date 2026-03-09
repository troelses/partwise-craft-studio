
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Document as AppDocument } from '@/types/document';

// Helper function to convert JSON content to plain text
const jsonToPlainText = (jsonContent: string): string => {
  if (!jsonContent) return '';
  
  try {
    const parsed = JSON.parse(jsonContent);
    if (parsed.content) {
      return extractTextFromNodes(parsed.content);
    }
  } catch (error) {
    // If JSON parsing fails, return as plain text
    return jsonContent;
  }
  
  return '';
};

const extractTextFromNodes = (nodes: any[]): string => {
  let text = '';
  
  nodes.forEach(node => {
    if (node.type === 'text') {
      text += node.text || '';
    } else if (node.content) {
      text += extractTextFromNodes(node.content);
    }
    
    // Add line breaks for paragraphs and headings
    if (node.type === 'paragraph' || node.type === 'heading') {
      text += '\n';
    }
  });
  
  return text;
};

export const exportToWord = async (document: AppDocument) => {
  try {
    const sortedSections = [...document.sections].sort((a, b) => a.order - b.order);
    
    const doc = new DocxDocument({
      sections: [{
        properties: {},
        children: [
          // Document title
          new Paragraph({
            children: [
              new TextRun({
                text: document.title,
                bold: true,
                size: 32,
              }),
            ],
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 },
          }),
          
          // Document metadata
          new Paragraph({
            children: [
              new TextRun({
                text: `Category: ${document.category} | Created: ${new Date(document.createdAt).toLocaleDateString()}`,
                italics: true,
                size: 20,
              }),
            ],
            spacing: { after: 400 },
          }),
          
          // Sections
          ...sortedSections.flatMap(section => [
            new Paragraph({
              children: [
                new TextRun({
                  text: section.title,
                  bold: true,
                  size: 24,
                }),
              ],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: jsonToPlainText(section.content) || '[No content provided for this section]',
                  size: 22,
                }),
              ],
              spacing: { after: 200 },
            }),
          ]),
          
          // Footer
          new Paragraph({
            children: [
              new TextRun({
                text: `Last updated: ${new Date(document.updatedAt).toLocaleDateString()}`,
                italics: true,
                size: 20,
              }),
            ],
            spacing: { before: 400 },
          }),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
    const blob = new Blob([new Uint8Array(buffer)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    
    const url = URL.createObjectURL(blob);
    const link = globalThis.document.createElement('a');
    link.href = url;
    link.download = `${document.title}.docx`;
    link.click();
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting to Word:', error);
    throw new Error('Failed to export document to Word format');
  }
};

export const exportToPDF = async (document: AppDocument) => {
  try {
    const sortedSections = [...document.sections].sort((a, b) => a.order - b.order);
    
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPosition = margin;
    
    // Helper function to add text with word wrapping
    const addTextToPDF = (text: string, fontSize: number, isBold: boolean = false) => {
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
      
      const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
      
      lines.forEach((line: string) => {
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        
        pdf.text(line, margin, yPosition);
        yPosition += fontSize * 0.5;
      });
      
      yPosition += fontSize * 0.3; // Add some space after each block
    };
    
    // Document title
    addTextToPDF(document.title, 20, true);
    yPosition += 10;
    
    // Document metadata
    addTextToPDF(`Category: ${document.category} | Created: ${new Date(document.createdAt).toLocaleDateString()}`, 10);
    yPosition += 15;
    
    // Sections
    sortedSections.forEach(section => {
      // Section title
      addTextToPDF(section.title, 16, true);
      yPosition += 5;
      
      // Section content
      const content = jsonToPlainText(section.content) || '[No content provided for this section]';
      addTextToPDF(content, 12);
      yPosition += 10;
    });
    
    // Footer
    yPosition += 10;
    addTextToPDF(`Last updated: ${new Date(document.updatedAt).toLocaleDateString()}`, 10);
    
    pdf.save(`${document.title}.pdf`);
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    throw new Error('Failed to export document to PDF format');
  }
};
