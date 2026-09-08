import JSZip from 'jszip';
import { buildStyleMap, buildRelMap, parseBody, parseFootnotes } from './ooxml';
import { boldLooksLikeHeading, splitIntoSections, TemplateSectionRef } from './sectionSplitter';
import { ImportPreview, ParsedDocx } from './types';

/**
 * Parse a .docx entirely in the browser.
 *
 * Deliberately client-side: parsing server-side would mean uploading the file
 * first, which means a Storage bucket and new bucket policies — a security-model
 * change this work is not allowed to make. A .docx is a zip of XML, so JSZip
 * plus the platform's own DOMParser are enough.
 *
 * This module performs no database access of any kind. Nothing is written until
 * the user confirms the mapping.
 */

const parseXml = (xml: string): Document =>
  new DOMParser().parseFromString(xml, 'application/xml');

const readMaybe = async (zip: JSZip, path: string): Promise<Document | null> => {
  const file = zip.file(path);
  if (!file) return null;
  return parseXml(await file.async('string'));
};

export const parseDocxFile = async (file: File | Blob): Promise<ParsedDocx> => {
  const zip = await JSZip.loadAsync(file);

  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Filen ser ikke ud til at være et Word-dokument (word/document.xml mangler).');
  }

  const documentDoc = parseXml(await documentFile.async('string'));
  const stylesDoc = await readMaybe(zip, 'word/styles.xml');
  const footnotesDoc = await readMaybe(zip, 'word/footnotes.xml');
  const relsDoc = await readMaybe(zip, 'word/_rels/document.xml.rels');

  const styles = stylesDoc ? buildStyleMap(stylesDoc) : new Map<string, string>();
  const footnotes = parseFootnotes(footnotesDoc);
  const rels = buildRelMap(relsDoc);

  const { blocks, warnings, usedFootnotes } = parseBody(
    documentDoc, styles, footnotes, rels, boldLooksLikeHeading
  );

  const orphans = [...footnotes.keys()].filter(id => !usedFootnotes.has(id));
  if (orphans.length) {
    warnings.push(`${orphans.length} fodnote(r) i filen har ingen henvisning i teksten og blev udeladt.`);
  }

  return { blocks, footnotes, warnings };
};

/** Parse and structure in one call: what the import dialog uses. */
export const previewDocxImport = async (
  file: File | Blob,
  template: TemplateSectionRef[]
): Promise<ImportPreview> => {
  const parsed = await parseDocxFile(file);
  const footnoteCount = parsed.blocks.reduce(
    (n, b) => n + JSON.stringify(b.node).split('"footnote"').length - 1, 0
  );
  return splitIntoSections(parsed.blocks, template, footnoteCount, parsed.warnings);
};
