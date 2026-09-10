import React, { useState } from 'react';
import { AlertTriangle, FileUp, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { documentService } from '@/services/documentService';
import { templateService, Template, TemplateSectionRef } from '@/services/templateService';
import {
  kerneopgaverService,
  KerneopgaveImportItem,
} from '@/services/kerneopgaverService';
import { previewDocxImport } from '@/utils/docxImport/parseDocx';
import { blocksToJson } from '@/utils/docxImport/blocksToDoc';
import {
  DocxBlock,
  ImportPreview,
  ParsedKerneopgave,
} from '@/utils/docxImport/types';
import {
  KERNEOPGAVE_SECTION_LABELS,
  KerneopgaveSectionType,
} from '@/constants/kerneopgaver';

/**
 * Import a Word specialebeskrivelse into a new version of a document.
 *
 * Three steps in one dialog: choose the template and the file, review what the
 * parser made of it, then write. Nothing touches the database before the last
 * step, and even then only `draft_content` — publishing stays behind
 * `approve_section`, so a bad import is discarded by simply never promoting the
 * version it created.
 *
 * The review step is the feature, not a safety net. Matching a Word heading to
 * a template section cannot be made reliable: the real drafts contain typo'd
 * headings, a grouping heading that looks like a kerneopgave, and headings
 * whose level lives in a character style. A human confirming the mapping is
 * part of the design.
 */

const UNASSIGNED = '__unassigned__';

interface Candidate {
  key: string;
  sourceHeading: string;
  blocks: DocxBlock[];
  kerneopgaver: ParsedKerneopgave[];
  confidence: number;
  /** template_sections.id, or UNASSIGNED. */
  target: string;
}

interface DocumentImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The version being imported from — the new version is created off it. */
  documentId: string;
  /** Template of that version, used as the default choice. */
  currentTemplateId?: string | null;
  /** Called with the new version's id once everything has been written. */
  onImported: (newDocumentId: string) => void;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const confidenceBadge = (confidence: number) => {
  if (confidence >= 0.95) return <Badge variant="secondary">Sikker</Badge>;
  if (confidence >= 0.75) return <Badge variant="outline">Sandsynlig</Badge>;
  return <Badge variant="destructive">Usikker</Badge>;
};

/** A synthetic heading block, so a title that is not going to become a
 *  kerneopgave still reads as a heading in the section it falls back into. */
const headingBlock = (text: string): DocxBlock => ({
  level: 3,
  via: null,
  text,
  node: { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] },
  listKind: null,
});

/**
 * Split one parsed kerneopgaver section into the rows to write and the blocks
 * that have to fall back into the section's own text.
 *
 * Two cases here are not defensive coding — both occur in the real drafts and
 * both silently lost content until they were measured:
 *
 * - An item with no recognised subsections is not a kerneopgave. Its heading and
 *   text go into the section body instead, which is what it actually is.
 * - A repeated subsection type must merge, not overwrite. They are concatenated,
 *   and the review screen flags the item so it can be fixed at source.
 */
const buildKerneopgavePayload = (
  kerneopgaver: ParsedKerneopgave[]
): { items: KerneopgaveImportItem[]; fallbackBlocks: DocxBlock[] } => {
  const items: KerneopgaveImportItem[] = [];
  const fallbackBlocks: DocxBlock[] = [];

  for (const item of kerneopgaver) {
    if (item.sections.length === 0) {
      fallbackBlocks.push(headingBlock(item.title), ...item.leadIn);
      continue;
    }

    const byType = new Map<KerneopgaveSectionType, DocxBlock[]>();
    item.sections.forEach((section, index) => {
      // Content before the first recognised subsection heading is prepended to
      // that subsection rather than dropped — there is nowhere else to put it.
      const blocks = index === 0 ? [...item.leadIn, ...section.blocks] : section.blocks;
      byType.set(section.type, [...(byType.get(section.type) ?? []), ...blocks]);
    });

    items.push({
      title: item.title,
      sections: [...byType.entries()].map(([sectionType, blocks]) => ({
        sectionType,
        draftContent: blocksToJson(blocks),
      })),
    });
  }

  return { items, fallbackBlocks };
};

/** Items the parser produced that will not become kerneopgaver, and items whose
 *  subsections repeat — both are shown in the review rather than resolved
 *  silently, because the reliable fix is in the Word document. */
const kerneopgaveAnomalies = (kerneopgaver: ParsedKerneopgave[]): string[] => {
  const notes: string[] = [];
  for (const item of kerneopgaver) {
    if (item.sections.length === 0) {
      notes.push(`“${item.title}” har ingen underafsnit og importeres som tekst i afsnittet, ikke som en kerneopgave.`);
      continue;
    }
    const seen = new Set<KerneopgaveSectionType>();
    const repeated = new Set<KerneopgaveSectionType>();
    for (const section of item.sections) {
      if (seen.has(section.type)) repeated.add(section.type);
      seen.add(section.type);
    }
    if (repeated.size > 0) {
      notes.push(`“${item.title}” har det samme underafsnit flere gange — sandsynligvis fordi en overskrift ikke er formateret som overskrift i Word. Indholdet slås sammen.`);
    }
  }
  return notes;
};

const DocumentImportDialog: React.FC<DocumentImportDialogProps> = ({
  open,
  onOpenChange,
  documentId,
  currentTemplateId,
  onImported,
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateSections, setTemplateSections] = useState<TemplateSectionRef[]>([]);
  const [templateId, setTemplateId] = useState<string>(currentTemplateId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [canWriteKerneopgaver, setCanWriteKerneopgaver] = useState(true);
  const { toast } = useToast();

  const loadTemplates = async () => {
    if (templates.length > 0) return;
    try {
      setTemplates(await templateService.getTemplates());
    } catch (error) {
      toast({
        title: 'Fejl',
        description: errorMessage(error, 'Skabelonerne kunne ikke hentes'),
        variant: 'destructive',
      });
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCandidates([]);
    setTemplateSections([]);
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) reset();
    else loadTemplates();
    onOpenChange(value);
  };

  const analyse = async () => {
    if (!templateId || !file) return;
    setIsAnalysing(true);
    try {
      const sections = await templateService.getTemplateSectionRefs(templateId);
      const result = await previewDocxImport(file, sections);

      setTemplateSections(sections);
      setPreview(result);
      setCanWriteKerneopgaver(
        await kerneopgaverService.canWriteKerneopgaverInNewVersion(documentId)
      );
      setCandidates([
        ...result.sections.map((section, index) => ({
          key: `s${index}`,
          sourceHeading: section.sourceHeading,
          blocks: section.blocks,
          kerneopgaver: section.kerneopgaver,
          confidence: section.confidence,
          target: section.templateSectionId ?? UNASSIGNED,
        })),
        ...result.unassigned.map((entry, index) => ({
          key: `u${index}`,
          sourceHeading: entry.sourceHeading,
          blocks: entry.blocks,
          kerneopgaver: [] as ParsedKerneopgave[],
          confidence: 0,
          target: UNASSIGNED,
        })),
      ]);
    } catch (error) {
      toast({
        title: 'Filen kunne ikke læses',
        description: errorMessage(error, 'Dokumentet kunne ikke analyseres'),
        variant: 'destructive',
      });
    } finally {
      setIsAnalysing(false);
    }
  };

  const setTarget = (key: string, target: string) =>
    setCandidates(current =>
      current.map(candidate => (candidate.key === key ? { ...candidate, target } : candidate))
    );

  const assigned = candidates.filter(candidate => candidate.target !== UNASSIGNED);

  const duplicateTargets = [
    ...new Set(
      assigned
        .map(candidate => candidate.target)
        .filter((target, index, all) => all.indexOf(target) !== index)
    ),
  ];

  const kerneopgaverSectionId =
    templateSections.find(section => section.sectionKey === 'kerneopgaver')?.id ?? null;

  // Kerneopgaver can only be written into the section the schema ties them to.
  const strandedKerneopgaver = candidates.filter(
    candidate => candidate.kerneopgaver.length > 0 && candidate.target !== kerneopgaverSectionId
  );

  const importsKerneopgaver = assigned.some(
    candidate => candidate.target === kerneopgaverSectionId && candidate.kerneopgaver.length > 0
  );

  // Refused up front rather than part-way through: sections would already have
  // been written by the time the kerneopgaver insert was refused.
  const blockedByKerneopgaverAccess = importsKerneopgaver && !canWriteKerneopgaver;

  const canImport =
    assigned.length > 0 &&
    duplicateTargets.length === 0 &&
    !blockedByKerneopgaverAccess &&
    !isWriting;

  const runImport = async () => {
    if (!templateId) return;
    setIsWriting(true);
    try {
      // copyContent: false — imported text replaces rather than augments, and
      // it keeps the new version free of kerneopgaver copied from the source.
      const newDocumentId = await documentService.createDocumentVersion(
        documentId,
        templateId,
        false
      );

      const payloads = assigned
        .filter(candidate => candidate.target === kerneopgaverSectionId)
        .map(candidate => buildKerneopgavePayload(candidate.kerneopgaver));

      const fallbackBlocks = payloads.flatMap(payload => payload.fallbackBlocks);

      for (const candidate of assigned) {
        // Anything that could not become a kerneopgave is appended to the
        // section's own text, so no parsed paragraph goes unwritten.
        const blocks =
          candidate.target === kerneopgaverSectionId
            ? [...candidate.blocks, ...fallbackBlocks]
            : candidate.blocks;
        const content = blocksToJson(blocks);
        if (!content) continue;
        await documentService.updateSection({
          id: '',
          title: candidate.sourceHeading,
          content,
          order: 0,
          documentId: newDocumentId,
          createdAt: '',
          updatedAt: '',
          templateSectionId: candidate.target,
        });
      }

      const items = payloads.flatMap(payload => payload.items);
      if (items.length > 0) {
        await kerneopgaverService.importKerneopgaver(newDocumentId, items);
      }

      toast({
        title: 'Dokumentet er importeret',
        description:
          'Indholdet ligger som udkast i en ny version. Versionen bliver først den aktuelle, når den sættes som det.',
      });
      reset();
      onOpenChange(false);
      onImported(newDocumentId);
    } catch (error) {
      toast({
        title: 'Importen mislykkedes',
        description: errorMessage(error, 'Indholdet kunne ikke skrives'),
        variant: 'destructive',
      });
    } finally {
      setIsWriting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importér fra Word</DialogTitle>
          <DialogDescription>
            Indholdet lægges i en ny version som udkast. Intet bliver publiceret,
            og den nuværende version ændres ikke.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!preview && (
            <>
              <div className="space-y-2">
                <Label>Skabelon</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Vælg en skabelon" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Dokumenter med afsnittet “Intern medicin” skal bruge
                  intern medicin-skabelonen. Vælges den forkerte skabelon, vil
                  afsnittet stå som ikke tildelt i næste trin.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Word-fil</Label>
                <input
                  type="file"
                  accept=".docx"
                  onChange={event => setFile(event.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm"
                />
              </div>
            </>
          )}

          {preview && (
            <>
              <p className="text-sm text-muted-foreground">
                {assigned.length} af {candidates.length} tekstblokke er tildelt et
                afsnit. {preview.footnoteCount} fodnote(r) fundet.
              </p>

              {preview.warnings.map((warning, index) => (
                <p
                  key={`w${index}`}
                  className="text-xs text-amber-700 flex items-start gap-1"
                >
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  {warning}
                </p>
              ))}

              {duplicateTargets.length > 0 && (
                <p className="text-sm text-destructive">
                  To tekstblokke peger på det samme afsnit. Ret tildelingen, før du
                  importerer.
                </p>
              )}

              {blockedByKerneopgaverAccess && (
                <p className="text-sm text-destructive">
                  Du har ikke rettigheder til at oprette kerneopgaver i en ny
                  version af dette dokument. Kun dokumentets teamleder og
                  administratorer kan det. Bed en af dem om at importere
                  dokumentet, eller få tildelt rollen først — importen er stoppet,
                  så der ikke oprettes en halvt udfyldt version.
                </p>
              )}

              {strandedKerneopgaver.length > 0 && (
                <p className="text-sm text-amber-700">
                  Kerneopgaver kan kun gemmes i kerneopgave-afsnittet. De vil ikke
                  blive importeret, så længe blokken peger et andet sted hen.
                </p>
              )}

              {candidates.map(candidate => (
                <div key={candidate.key} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">
                        {candidate.sourceHeading || '(uden overskrift)'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {candidate.blocks.length} afsnit
                        {candidate.kerneopgaver.length > 0 &&
                          ` · ${candidate.kerneopgaver.length} kerneopgaver`}
                      </div>
                    </div>
                    {candidate.target !== UNASSIGNED && confidenceBadge(candidate.confidence)}
                  </div>

                  <div>
                    <Select
                      value={candidate.target}
                      onValueChange={value => setTarget(candidate.key, value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>
                          Ikke tildelt — importeres ikke
                        </SelectItem>
                        {templateSections.map(section => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {candidate.kerneopgaver.length > 0 && (
                    <div className="space-y-2 pl-3 border-l">
                      {candidate.kerneopgaver.map((item, index) => (
                        <div key={`${candidate.key}-k${index}`}>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.sections.length > 0
                              ? item.sections
                                  .map(section => KERNEOPGAVE_SECTION_LABELS[section.type])
                                  .join(' · ')
                              : 'Ingen underafsnit fundet'}
                          </p>
                          {item.warnings.map((warning, wIndex) => (
                            <p key={`w${wIndex}`} className="text-xs text-amber-700">
                              {warning}
                            </p>
                          ))}
                          {kerneopgaveAnomalies([item]).map((note, aIndex) => (
                            <p key={`a${aIndex}`} className="text-xs text-amber-700">
                              {note}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          {!preview ? (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Annuller
              </Button>
              <Button onClick={analyse} disabled={!templateId || !file || isAnalysing}>
                {isAnalysing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4 mr-1" />
                )}
                Analysér
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={reset} disabled={isWriting}>
                Vælg en anden fil
              </Button>
              <Button onClick={runImport} disabled={!canImport}>
                {isWriting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Importér som ny version
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentImportDialog;
