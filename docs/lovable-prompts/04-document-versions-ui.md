# Prompt 4 — Document versions

Requires prompts 1 and 2, and **all three** migrations applied — including
`20260902090000-versioning-on-document-access.sql`, which is the one that ties
versioning to `document_access`.

A document is now a group of versions. Each version is its own row, owns its own
sections, and carries its own template — so a new version can be built on a
different template than the one before it. Exactly one version in a group is
*current*, and that is the one shown in lists.

Two permission levels, both already enforced in the database:

- **create a version** — needs `write` on the document (or admin)
- **promote a version to current** — needs `approve`, because it decides what
  everyone sees by default

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- Do not touch the MCP integration, `query-documents`, or `document_access` logic.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


---

## 1. `src/services/documentService.ts`

**a. Add the types and the shared permission helper** immediately above
`export const documentService = {`:

```ts
/** Shared implementation for the two version permission checks, which differ
 *  only in which SECURITY DEFINER helper they call. */
const checkVersionPermission = async (
  documentId: string,
  fn: 'can_manage_document_versions' | 'can_publish_document_version'
): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: source, error: sourceError } = await supabase
      .from('documents')
      .select('version_group_id')
      .eq('id', documentId)
      .maybeSingle();

    if (sourceError || !source) return false;

    const { data, error } = await supabase.rpc(fn, {
      p_user_id: user.id,
      p_version_group_id: source.version_group_id,
    });

    if (error) {
      console.error(`Error checking version permission (${fn}):`, error);
      return false;
    }

    return data === true;
  } catch (error) {
    console.error(`Error checking version permission (${fn}):`, error);
    return false;
  }
};

export interface DocumentVersion {
  id: string;
  title: string;
  versionGroupId: string;
  versionNumber: number;
  isCurrent: boolean;
  templateId: string | null;
  templateName: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**b. Add the version methods.** Find this line inside the `documentService` object:

```ts
  // Check if current user is team lead for a document
```

and insert the following block immediately **before** it:

```ts
  // --- Versions ---------------------------------------------------------------

  // List every version of the document group that the given document belongs to,
  // newest version first.
  getDocumentVersions: async (documentId: string): Promise<DocumentVersion[]> => {
    try {
      const { data: source, error: sourceError } = await supabase
        .from('documents')
        .select('version_group_id')
        .eq('id', documentId)
        .maybeSingle();

      if (sourceError) throw sourceError;
      if (!source) return [];

      const { data, error } = await supabase
        .from('documents')
        .select('id, title, version_group_id, version_number, is_current, template_id, created_at, updated_at, templates ( name )')
        .eq('version_group_id', source.version_group_id)
        .order('version_number', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as unknown as DocumentVersionRow[];

      return rows.map(row => {
        const template = Array.isArray(row.templates) ? row.templates[0] : row.templates;

        return {
          id: row.id,
          title: row.title,
          versionGroupId: row.version_group_id,
          versionNumber: row.version_number,
          isCurrent: row.is_current,
          templateId: row.template_id,
          templateName: template?.name ?? null,
          createdAt: row.created_at || '',
          updatedAt: row.updated_at || '',
        };
      });
    } catch (error) {
      console.error('Error fetching document versions:', error);
      throw error;
    }
  },

  // Create a new version of a document, optionally on a different template.
  // The new version is not made current — promote it with setCurrentVersion.
  // Returns the new version's document id.
  createDocumentVersion: async (
    sourceDocumentId: string,
    templateId: string,
    copyContent: boolean = true
  ): Promise<string> => {
    const { data, error } = await supabase.rpc('create_document_version', {
      p_source_document_id: sourceDocumentId,
      p_template_id: templateId,
      p_copy_content: copyContent,
    });

    if (error) {
      console.error('Error creating document version:', error);
      throw error;
    }

    return data as string;
  },

  // Promote a version to be the current one for its group.
  setCurrentVersion: async (documentId: string): Promise<void> => {
    const { error } = await supabase.rpc('set_current_document_version', {
      p_document_id: documentId,
    });

    if (error) {
      console.error('Error setting current version:', error);
      throw error;
    }
  },

  // Whether the current user may create a version of this document's group.
  // Requires write-level access (document_access), or admin.
  canManageVersions: async (documentId: string): Promise<boolean> => {
    return checkVersionPermission(documentId, 'can_manage_document_versions');
  },

  // Whether the current user may promote a version to current. Promoting
  // decides what everyone sees by default, so it requires approve-level access.
  canPublishVersion: async (documentId: string): Promise<boolean> => {
    return checkVersionPermission(documentId, 'can_publish_document_version');
  },
```

## 2. Create `src/components/DocumentVersions.tsx`

New file, exactly:

```tsx
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
      <div className="animate-pulse space-y-3">
        <div className="h-20 bg-gray-200 rounded" />
        <div className="h-20 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center">
            <GitBranch className="h-5 w-5 mr-2" />
            Versions
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            The current version is the one shown by default in the document list.
          </p>
        </div>
        {canCreate && (
          <Button onClick={openDialog} className="flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            New version
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {versions.map(version => {
          const isViewing = version.id === documentId;
          return (
            <Card
              key={version.id}
              className={version.isCurrent ? 'border-blue-300 bg-blue-50/40' : ''}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Version {version.versionNumber}
                    {version.isCurrent && (
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                        <Star className="h-3 w-3 mr-1" />
                        Current
                      </Badge>
                    )}
                    {isViewing && (
                      <Badge variant="outline" className="text-gray-600">
                        Viewing
                      </Badge>
                    )}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>
                    Template:{' '}
                    <span className="font-medium">
                      {version.templateName ?? 'Unknown template'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    Created {formatDate(version.createdAt)} · Updated{' '}
                    {formatDate(version.updatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
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
                      variant="outline"
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
            <div>
              <label className="block text-sm font-medium mb-1">Template</label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
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
                onCheckedChange={value => setCopyContent(value === true)}
              />
              <div className="grid gap-1 leading-none">
                <label
                  htmlFor="copy-content"
                  className={`text-sm font-medium ${!canCopyContent ? 'text-gray-400' : ''}`}
                >
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
            <Button onClick={handleCreateVersion} disabled={isCreating || !selectedTemplateId}>
              {isCreating ? 'Creating…' : 'Create version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentVersions;
```

## 3. Add a Versions tab to `src/pages/DocumentView.tsx`

**a. Add the import** after the `TeamLeadApproval` import:

```ts
import DocumentVersions from '@/components/DocumentVersions';
```

**b. Add the icon.** The file imports icons from `lucide-react`; add `GitBranch`
to that existing import list.

**c. Widen the view mode.** Find:

```ts
  const [viewMode, setViewMode] = useState<'view' | 'edit' | 'approve'>('view');
```

Replace with:

```ts
  const [viewMode, setViewMode] = useState<'view' | 'edit' | 'approve' | 'versions'>('view');
```

**d. Add the toggle button.** Find the end of the mode-toggle group — the
`canApprove &&` button that renders "Approve" — and add this button immediately
after it, still inside the same wrapping `<div>`:

```tsx
                <Button
                  variant={viewMode === 'versions' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('versions')}
                  className="flex items-center"
                >
                  <GitBranch className="h-4 w-4 mr-1" />
                  Versions
                </Button>
```

Anyone who can open the document may look at its version history; the actions
inside the panel are gated separately in the next step.

**e. Render the panel.** Find the `viewMode === 'approve'` render block and add
this immediately after it:

```tsx
          {viewMode === 'versions' && (
            <DocumentVersions
              documentId={document.id}
              canCreate={canEdit}
              canPublish={canApprove}
            />
          )}
```

`canEdit` and `canApprove` already exist in this component and are derived from
the caller's `document_access` permission, so the UI matches what the database
will actually allow.

**f. Guard effect.** This file has an effect that bounces the user out of a mode
they lack rights for. `'versions'` is readable by anyone who can see the
document, so make sure that effect does **not** redirect away from `'versions'` —
leave it reachable in all cases.
