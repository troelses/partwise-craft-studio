import React, { useEffect, useState } from 'react';
import { CheckCircle, Clock, Eye, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { renderRichText } from '@/utils/richTextRenderer';
import {
  Kerneopgave,
  KerneopgaveSection,
  kerneopgaverService,
} from '@/services/kerneopgaverService';
import { KERNEOPGAVE_SECTION_LABELS } from '@/constants/kerneopgaver';

/**
 * The kerneopgave half of the approval dashboard.
 *
 * Section 2.2 is usually the largest part of a specialebeskrivelse, and until
 * now none of it appeared here: the dashboard listed document_sections only, so
 * an approver could not see what they were about to publish. "Approve all"
 * publishes these rows, so they have to be reviewable.
 *
 * Read-only by design. Approval happens through approve_document, which covers
 * both tables in one transaction; there is no per-subsection approve RPC, and
 * adding one would reintroduce the partial-approval problem that function exists
 * to avoid.
 */

interface KerneopgaveApprovalListProps {
  documentId: string;
  /** Changes whenever an approval happens, so the list reloads with it. */
  reloadSignal: string;
}

const statusOf = (section: KerneopgaveSection) => {
  if (section.isApproved) return { label: 'approved', Icon: CheckCircle, color: 'text-green-600' };
  if (!section.draftContent) return { label: 'empty', Icon: XCircle, color: 'text-gray-400' };
  if (section.publishedContent) return { label: 'has changes', Icon: Clock, color: 'text-blue-600' };
  return { label: 'pending', Icon: Clock, color: 'text-yellow-600' };
};

const KerneopgaveApprovalList: React.FC<KerneopgaveApprovalListProps> = ({
  documentId,
  reloadSignal,
}) => {
  const [kerneopgaver, setKerneopgaver] = useState<Kerneopgave[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    kerneopgaverService
      .getKerneopgaver(documentId)
      .then(data => { if (!cancelled) setKerneopgaver(data); })
      // A failure here must not take the sections half of the dashboard down.
      .catch(error => console.error('Error loading kerneopgaver for approval:', error));
    return () => { cancelled = true; };
  }, [documentId, reloadSignal]);

  if (kerneopgaver.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Kerneopgaver</h3>
        <p className="text-sm text-muted-foreground">
          Approved together with the sections above. Empty subsections are left alone.
        </p>
      </div>

      <div className="space-y-4">
        {kerneopgaver.map(item => (
          <div key={item.id} className="rounded-lg border p-4 space-y-3">
            <h4 className="font-medium">{item.title}</h4>

            <div className="space-y-2">
              {item.sections.map(section => {
                const { label, Icon, color } = statusOf(section);
                const key = `${item.id}-${section.sectionType}`;
                const isExpanded = expanded === key;

                return (
                  <div key={key} className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Icon className={`h-4 w-4 ${color}`} />
                        <span className="font-medium">
                          {KERNEOPGAVE_SECTION_LABELS[section.sectionType] ?? section.sectionType}
                        </span>
                        <span className="text-muted-foreground">{label}</span>
                      </div>
                      {(section.draftContent || section.publishedContent) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpanded(isExpanded ? null : key)}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          {isExpanded ? 'Hide' : 'Review'}
                        </Button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <h5 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                            Draft
                          </h5>
                          <div className="rounded-md border bg-background p-3 text-sm">
                            {section.draftContent
                              ? renderRichText(section.draftContent)
                              : <p className="text-muted-foreground">No draft content</p>}
                          </div>
                        </div>
                        <div>
                          <h5 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                            Published
                          </h5>
                          <div className="rounded-md border bg-background p-3 text-sm">
                            {section.publishedContent
                              ? renderRichText(section.publishedContent)
                              : <p className="text-muted-foreground">Not published yet</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KerneopgaveApprovalList;
