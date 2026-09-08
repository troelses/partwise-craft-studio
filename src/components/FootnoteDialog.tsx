import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Content } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Link as LinkIcon,
  Unlink,
} from 'lucide-react';
import { NoteRun, noteRunsToTipTapDoc, tipTapDocToNoteRuns } from '@/utils/footnotes';

interface FootnoteDialogProps {
  open: boolean;
  /** The note being edited, or [] when inserting a new one. */
  note: NoteRun[];
  onCancel: () => void;
  onSave: (note: NoteRun[]) => void;
}

/**
 * Edits a single footnote body. The body is inline-only — one paragraph of
 * marked text, optionally carrying links — so it uses a small nested TipTap
 * instance rather than the full section editor.
 */
const FootnoteDialog: React.FC<FootnoteDialogProps> = ({ open, note, onCancel, onSave }) => {
  const [linkUrl, setLinkUrl] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const editor = useEditor({
    extensions: [
      // Block-level features are deliberately off: a footnote is one paragraph.
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: noteRunsToTipTapDoc(note) as Content,
    editorProps: {
      attributes: { class: 'focus:outline-none min-h-[80px] p-3' },
    },
  });

  // Reload the body whenever the dialog is opened for a different footnote.
  useEffect(() => {
    if (!editor || !open) return;
    editor.commands.setContent(noteRunsToTipTapDoc(note) as Content, false);
    setShowLinkInput(false);
    setLinkUrl('');
  }, [open, note, editor]);

  if (!editor) return null;

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  const startLink = () => {
    setLinkUrl(editor.getAttributes('link').href ?? '');
    setShowLinkInput(true);
  };

  const btn = (active: boolean) => `h-8 w-8 p-0 ${active ? 'bg-gray-200' : ''}`;

  return (
    <Dialog open={open} onOpenChange={value => !value && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fodnote</DialogTitle>
          <DialogDescription>
            Teksten vises nederst i dokumentet. Marker tekst og tilføj et link for
            at give linket en anden visningstekst end selve adressen.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-gray-300 rounded-md overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-200 p-2 flex flex-wrap gap-1 items-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={btn(editor.isActive('bold'))}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={btn(editor.isActive('italic'))}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={btn(editor.isActive('underline'))}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={btn(editor.isActive('strike'))}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="h-4 w-4" />
            </Button>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={btn(editor.isActive('link'))}
              onClick={startLink}
              title="Tilføj link"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>

            {editor.isActive('link') && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
                title="Fjern link"
              >
                <Unlink className="h-4 w-4" />
              </Button>
            )}
          </div>

          {showLinkInput && (
            <div className="flex items-end gap-2 p-2 border-b border-gray-200 bg-white">
              <div className="flex-1">
                <Label className="text-xs">Adresse</Label>
                <Input
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      applyLink();
                    }
                  }}
                  placeholder="https://…"
                  className="h-8"
                />
              </div>
              <Button type="button" size="sm" onClick={applyLink}>
                Anvend
              </Button>
            </div>
          )}

          <EditorContent editor={editor} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Annuller
          </Button>
          <Button type="button" onClick={() => onSave(tipTapDocToNoteRuns(editor.getJSON()))}>
            Gem fodnote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FootnoteDialog;
