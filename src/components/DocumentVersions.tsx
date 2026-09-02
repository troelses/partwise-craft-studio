import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, GitBranch, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { documentService, DocumentVersion } from '@/services/documentService';
import { templateService, Template } from '@/services/templateService';
import { useToast } from '@/hooks/use-toast';

interface DocumentVersionsProps {
  documentId: string;
  /** Write-level access: may create a new version. */
  canCreate: boolean;
  /** Approve-level access: may promote a version to current. Promoting decides
   *  what everyone sees by default, so it is gated more tightly than creating. */
  canPublish: boolean;
}

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const formatDate = (value: string) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('da-DK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const DocumentVersions: React.FC<DocumentVersionsProps> = ({ documentId, canCreate, canPublish }) => {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [copyContent, setCopyContent] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const sourceVersion = versions.find(v => v.id === documentId) ?? versions[0];
  // document_sections are keyed by template_section_id, so content can only be
  // carried over when the new version stays on the same template.
  const canCopyContent =
    !!sourceVersion && !!selectedTemplateId && selectedTemplateId === sourceVersion.templateId;

  const loadVersions = async () => {
    try {
      setIsLoading(true);
      const data = await documentService.getDocumentVersions(documentId);
      setVersions(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load document versions',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVersions();
  }, [documentId]);

  const openDialog = async () => {
    setIsDialogOpen(true);
    if (templates.length === 0) {
      try {
        const data = await templateService.getTemplates();
        setTemplates(data);
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load templates',
          variant: 'destructive',
        });
        return;
      }
    }
    // Default to the template the current document already uses.
    const current = versions.find(v => v.id === documentId);
    if (current?.templateId) {
      setSelectedTemplateId(current.templateId);
    }
  };

  const handleCreateVersion = async () => {
    if (!selectedTemplateId) {
      toast({
        title: 'Vælg en skabelon',
        description: 'A template must be selected for the new version.',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);
    try {
      const newId = await documentService.createDocumentVersion(
        documentId,
        selectedTemplateId,
        canCopyContent && copyContent
      );
      toast({
        title: 'Version created',
        description: 'The new version was created. It is not current until you set it.',
      });
      setIsDialogOpen(false);
      navigate(`/documents/${newId}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: errorMessage(error, 'Failed to create version'),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSetCurrent = async (versionId: string) => {
    setPromotingId(versionId);
    try {
      await documentService.setCurrentVersion(versionId);
      await loadVersions();
      toast({
        title: 'Current version updated',
        description: 'This version now shows as the default in the document list.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: errorMessage(error, 'Failed to set current version'),
        variant: 'destructive',
      });
    } finally {
      setPromotingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-24 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-medium flex items-center">
            <GitBranch className="h-5 w-5 mr-2" />
            Versions
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            The current version is the one shown by default in the document list.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openDialog} className="flex items-center">
            <Plus className="h-4 w-4 mr-1" />
            New version
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {versions.map(version => {
          const isViewing = version.id === documentId;
          return (
            <Card key={version.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  <div className="flex items-center gap-2">
                    <span>Version {version.versionNumber}</span>
                    {version.isCurrent && (
                      <Badge className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Current
                      </Badge>
                    )}
                    {isViewing && (
                      <Badge variant="outline">
                        Viewing
                      </Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex justify-between items-end gap-4">
                <div className="text-sm text-gray-600 space-y-1">
                  <div>
                    Template:{' '}
                    <span className="font-medium">
                      {version.templateName ?? 'Unknown template'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Created {formatDate(version.createdAt)} · Updated{' '}
                    {formatDate(version.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isViewing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/documents/${version.id}`)}
                    >
                      Open
                    </Button>
                  )}
                  {canPublish && !version.isCurrent && (
                    <Button
                      size="sm"
                      disabled={promotingId === version.id}
                      onClick={() => handleSetCurrent(version.id)}
                      className="flex items-center"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {promotingId === version.id ? 'Setting…' : 'Set as current'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new version</DialogTitle>
            <DialogDescription>
              The new version starts out not current. Set it as current when it is
              ready to become the default.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Template</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
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
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="copy-content"
                checked={canCopyContent && copyContent}
                disabled={!canCopyContent}
                onCheckedChange={(value) => setCopyContent(value === true)}
              />
              <div className="space-y-1">
                <label htmlFor="copy-content" className="text-sm font-medium">
                  Copy content from this version
                </label>
                {!canCopyContent && (
                  <p className="text-xs text-gray-500">
                    Content can only be copied when the new version uses the same
                    template, because sections are tied to their template.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateVersion} disabled={isCreating}>
              {isCreating ? 'Creating…' : 'Create version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentVersions;
