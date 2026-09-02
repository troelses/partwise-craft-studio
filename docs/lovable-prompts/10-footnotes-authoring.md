# Prompt 10 — Footnotes, part 2: authoring and numbering

Requires prompt 9. After this, authors can insert footnotes with links, and the
read view numbers them continuously across the whole document.

**Guardrails:**

- Make only the changes described. Do not refactor or reformat anything else.
- Do not change the security model, regenerate RLS, or switch to the `service_role` key.
- Do not touch the MCP integration, `query-documents`, or `document_access` logic.
- Where a whole file is given, replace the file's entire contents with exactly what is shown.
- If a "find this" block does not match the file exactly, stop and report it rather than guessing.


---

## 1. Add the dependency

Add to `dependencies` in `package.json`:

```json
"@tiptap/extension-link": "^2.23.0"
```

Matches the pinned TipTap 2.x line already in use. Nothing else in `package.json` changes.

## 2. Create `src/extensions/Footnote.ts`

The first custom TipTap extension in this codebase. It is an **inline atom** —
the note body lives in `attrs`, not in ProseMirror content, so a renderer that
does not know about footnotes degrades to an empty element instead of dumping the
note inline in the body text.

It also reassigns ids on paste: copying a footnote would otherwise duplicate its
`fnId`, collapsing two markers onto one number and making the sequence skip.

```ts
import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { FOOTNOTE_NODE, NoteRun, newFnId } from '@/utils/footnotes';

/**
 * An inline, atomic footnote marker.
 *
 * The note body lives entirely in `attrs.note` (see src/utils/footnotes.ts for
 * why the format avoids any key named `text`). The node has no ProseMirror
 * content, so a renderer that does not yet know about footnotes degrades to an
 * empty element rather than dumping the note body inline in the body text.
 *
 * The visible number is not stored and not rendered here. Numbering is
 * continuous across the whole document and cannot be known from inside a single
 * section's editor, so the editor shows a provisional, section-local number via
 * a CSS counter (see src/index.css) and the true ordinal is computed in the read
 * view and on export.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: (note: NoteRun[]) => ReturnType;
      updateFootnote: (fnId: string, note: NoteRun[]) => ReturnType;
    };
  }
}

const parseNote = (value: unknown): NoteRun[] => {
  if (Array.isArray(value)) return value as NoteRun[];
  if (typeof value === 'string' && value) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as NoteRun[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const Footnote = Node.create({
  name: FOOTNOTE_NODE,

  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      // Defaults are declared explicitly and always written by the insert
      // command. RichTextEditor's prop-sync effect compares the serialised doc
      // against the incoming string, so attributes that appear only sometimes
      // would make the two differ and trigger a spurious setContent (and a
      // cursor jump) on every render.
      fnId: {
        default: null,
        parseHTML: element => element.getAttribute('data-footnote-id'),
        renderHTML: attributes => ({ 'data-footnote-id': attributes.fnId }),
      },
      note: {
        default: [] as NoteRun[],
        parseHTML: element => parseNote(element.getAttribute('data-note')),
        renderHTML: attributes => ({ 'data-note': JSON.stringify(attributes.note ?? []) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, {
        class: 'footnote-marker',
      }),
    ];
  },

  addCommands() {
    return {
      insertFootnote:
        (note: NoteRun[]) =>
        ({ commands }) =>
          commands.insertContent({
            type: FOOTNOTE_NODE,
            attrs: { fnId: newFnId(), note: note ?? [] },
          }),

      updateFootnote:
        (fnId: string, note: NoteRun[]) =>
        ({ state, dispatch }) => {
          let found = false;
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== FOOTNOTE_NODE) return;
            if (node.attrs.fnId !== fnId) return;
            found = true;
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, note: note ?? [] });
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },

  /**
   * Copy-pasting a footnote duplicates its id, which would collapse two markers
   * onto one ordinal and make the numbering skip a value. After any transaction
   * that changed the document, give a fresh id to every footnote whose id has
   * already been seen earlier in the document — and to any that arrived without
   * one at all.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('footnoteDedupe'),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some(tr => tr.docChanged)) return null;

          const seen = new Set<string>();
          const fixes: Array<{ pos: number; attrs: Record<string, unknown> }> = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== FOOTNOTE_NODE) return;
            const id = node.attrs.fnId;
            if (typeof id === 'string' && id && !seen.has(id)) {
              seen.add(id);
              return;
            }
            const replacement = newFnId();
            seen.add(replacement);
            fixes.push({ pos, attrs: { ...node.attrs, fnId: replacement } });
          });

          if (fixes.length === 0) return null;

          const tr = newState.tr;
          for (const fix of fixes) tr.setNodeMarkup(fix.pos, undefined, fix.attrs);
          return tr;
        },
      }),
    ];
  },
});

export default Footnote;
```

## 3. Create `src/components/FootnoteDialog.tsx`

Edits one footnote body in a small nested TipTap instance. Block features are off
— a footnote is a single paragraph — and it supports bold, italic, underline,
strike, and links whose display text differs from the URL.

```tsx
import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
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
    content: noteRunsToTipTapDoc(note),
    editorProps: {
      attributes: { class: 'focus:outline-none min-h-[80px] p-3' },
    },
  });

  // Reload the body whenever the dialog is opened for a different footnote.
  useEffect(() => {
    if (!editor || !open) return;
    editor.commands.setContent(noteRunsToTipTapDoc(note), false);
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

  const btn = (active: boolean) =>
    `h-8 w-8 p-0 ${active ? 'bg-gray-200' : ''}`;

  return (
    <Dialog open={open} onOpenChange={value => !value && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fodnote</DialogTitle>
          <DialogDescription>
            Teksten vises nederst i dokumentet. Marker tekst og tilføj et link for
            at give linket en anden visningstekst end selve adressen.
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-md">
          <div className="flex items-center gap-1 border-b p-1 bg-gray-50">
            <Button variant="ghost" size="sm" className={btn(editor.isActive('bold'))}
              onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className={btn(editor.isActive('italic'))}
              onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className={btn(editor.isActive('underline'))}
              onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <UnderlineIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className={btn(editor.isActive('strike'))}
              onClick={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough className="h-4 w-4" />
            </Button>
            <span className="w-px h-5 bg-gray-300 mx-1" />
            <Button variant="ghost" size="sm" className={btn(editor.isActive('link'))}
              onClick={startLink} title="Tilføj link">
              <LinkIcon className="h-4 w-4" />
            </Button>
            {editor.isActive('link') && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0"
                onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
                title="Fjern link">
                <Unlink className="h-4 w-4" />
              </Button>
            )}
          </div>

          {showLinkInput && (
            <div className="flex items-end gap-2 p-2 border-b bg-gray-50">
              <div className="flex-1">
                <Label htmlFor="fn-link" className="text-xs">Adresse</Label>
                <Input
                  id="fn-link"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }}
                  placeholder="https://…"
                  className="h-8"
                />
              </div>
              <Button size="sm" onClick={applyLink}>Anvend</Button>
            </div>
          )}

          <EditorContent editor={editor} className="prose max-w-none text-sm" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Annuller</Button>
          <Button onClick={() => onSave(tipTapDocToNoteRuns(editor.getJSON()))}>Gem fodnote</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FootnoteDialog;
```

## 4. Replace `src/components/RichTextEditor.tsx`

Replace the **whole file**. This registers Link and Footnote, adds link and
footnote toolbar buttons, and adds the link input row and the footnote dialog.

```tsx

import React, { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Link from '@tiptap/extension-link'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Footnote from '@/extensions/Footnote'
import FootnoteDialog from '@/components/FootnoteDialog'
import { FOOTNOTE_NODE, NoteRun } from '@/utils/footnotes'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  IndentIncrease,
  IndentDecrease,
  Link as LinkIcon,
  Unlink,
  Superscript,
} from 'lucide-react'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start typing...',
}: RichTextEditorProps) {
  const isUpdatingFromProps = useRef(false)
  const [footnoteOpen, setFootnoteOpen] = useState(false)
  const [editingFnId, setEditingFnId] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<NoteRun[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      BulletList,
      OrderedList,
      ListItem,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, autolink: false }),
      Footnote,
    ],
    content: (() => {
      if (!content) return '';

      try {
        return JSON.parse(content);
      } catch {
        // Content is not valid JSON (e.g. legacy plain text). Start empty
        // rather than crashing the editor.
        return '';
      }
    })(),
    editorProps: {
      attributes: {
        class: 'focus:outline-none',
        'data-placeholder': placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      // Only call onChange if we're not currently updating from props
      if (!isUpdatingFromProps.current) {
        onChange(JSON.stringify(editor.getJSON()))
      }
    },
  })

  // Keep editor in sync if `content` prop changes externally
  const prevContent = useRef(content)
  useEffect(() => {
    if (!editor) return
    
    // Get current content from editor
    const currentContent = JSON.stringify(editor.getJSON())
    
    // Only update if the content actually differs
    if (currentContent !== content) {
      isUpdatingFromProps.current = true
      
      try {
        const parsed = content ? JSON.parse(content) : ''
        editor.commands.setContent(parsed, false) // false = don't emit update event
      } catch {
        editor.commands.clearContent()
      } finally {
        isUpdatingFromProps.current = false
      }
    }
  }, [content, editor])

  // --- Links -----------------------------------------------------------------
  const startLink = () => {
    if (!editor) return
    setLinkUrl(editor.getAttributes('link').href ?? '')
    setShowLinkInput(true)
  }

  const applyLink = () => {
    if (!editor) return
    const url = linkUrl.trim()
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }

  // --- Footnotes ---------------------------------------------------------------
  // Edits the footnote under the cursor if there is one, otherwise inserts a new
  // one at the cursor.
  const openFootnoteDialog = () => {
    if (!editor) return
    if (editor.isActive(FOOTNOTE_NODE)) {
      const attrs = editor.getAttributes(FOOTNOTE_NODE)
      setEditingFnId(attrs.fnId ?? null)
      setEditingNote(Array.isArray(attrs.note) ? attrs.note : [])
    } else {
      setEditingFnId(null)
      setEditingNote([])
    }
    setFootnoteOpen(true)
  }

  const saveFootnote = (note: NoteRun[]) => {
    if (!editor) return
    if (editingFnId) {
      editor.chain().focus().updateFootnote(editingFnId, note).run()
    } else {
      editor.chain().focus().insertFootnote(note).run()
    }
    setFootnoteOpen(false)
    setEditingFnId(null)
    setEditingNote([])
  }

  if (!editor) return null

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 p-2 flex flex-wrap gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'bg-gray-200' : ''}
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'bg-gray-200' : ''}
        >
          <Italic className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={editor.isActive('underline') ? 'bg-gray-200' : ''}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'bg-gray-200' : ''}
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'bg-gray-200' : ''}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          disabled={!editor.can().sinkListItem('listItem')}
          title="Indent list item"
        >
          <IndentIncrease className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          disabled={!editor.can().liftListItem('listItem')}
          title="Outdent list item"
        >
          <IndentDecrease className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={editor.isActive('blockquote') ? 'bg-gray-200' : ''}
        >
          <Quote className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <span className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <Button
          variant="ghost"
          size="sm"
          onClick={startLink}
          className={editor.isActive('link') ? 'bg-gray-200' : ''}
          title="Indsæt link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        {editor.isActive('link') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
            title="Fjern link"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={openFootnoteDialog}
          className={editor.isActive(FOOTNOTE_NODE) ? 'bg-gray-200' : ''}
          title="Indsæt eller rediger fodnote"
        >
          <Superscript className="h-4 w-4" />
        </Button>

        <span className="w-px h-6 bg-gray-300 mx-1 self-center" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {showLinkInput && (
        <div className="flex items-end gap-2 p-2 border-b border-gray-200 bg-gray-50">
          <div className="flex-1">
            <Input
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyLink() } }}
              placeholder="https://…"
              className="h-8"
            />
          </div>
          <Button size="sm" onClick={applyLink}>Anvend</Button>
          <Button size="sm" variant="outline" onClick={() => setShowLinkInput(false)}>Annuller</Button>
        </div>
      )}

      <FootnoteDialog
        open={footnoteOpen}
        note={editingNote}
        onCancel={() => setFootnoteOpen(false)}
        onSave={saveFootnote}
      />

      {/* Editor Content */}
      <div className="p-4 prose max-w-none [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_li]:mb-1">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
```

## 5. Append to `src/index.css`

Add at the end of the file — do not remove anything already there:

```css
/* Footnotes.
   Numbering is continuous across the whole document, which a single section's
   editor cannot know. Inside the editor the marker therefore gets a provisional,
   section-local number from a CSS counter — it reflows instantly on insert and
   delete with no JavaScript. The final number is computed in the read view and
   on export. */
.ProseMirror {
  counter-reset: footnote;
}

.ProseMirror sup.footnote-marker::after {
  counter-increment: footnote;
  content: counter(footnote);
}

.ProseMirror sup.footnote-marker {
  color: #1d4ed8;
  font-weight: 500;
  cursor: pointer;
  padding: 0 0.1rem;
}

.ProseMirror sup.footnote-marker.ProseMirror-selectednode {
  outline: 2px solid #93c5fd;
  border-radius: 2px;
}
```

Numbering is continuous across the document, which a single section's editor
cannot know. Inside the editor the marker gets a provisional, section-local
number from a CSS counter, which reflows instantly on insert and delete with no
JavaScript. The final number appears in the read view.

## 6. Wire numbering into `src/components/DocumentContinuousView.tsx`

**a.** Find the renderer import:

```ts
import { renderRichText } from '@/utils/richTextRenderer';
```

Replace with:

```ts
import {
  renderRichText,
  FootnoteNumberingContext,
  FootnoteList,
} from '@/utils/richTextRenderer';
import { collectFootnotes, buildNumbering } from '@/utils/footnotes';
```

**b.** Find:

```tsx
  const sortedSections = [...documentSections].sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-4xl mx-auto">
```

Replace with:

```tsx
  const sortedSections = [...documentSections].sort((a, b) => a.order - b.order);

  // Footnote numbering runs continuously across the whole document, so it is
  // computed here — above the section loop — and supplied to every section's
  // renderer through context. Sections are saved independently, so nothing is
  // persisted: inserting a footnote in an early section renumbers the later
  // ones on the next render without touching their stored content.
  const orderedContents = sortedSections.map(section => section.content);
  const footnoteEntries = collectFootnotes(orderedContents);
  const footnoteNumbering = buildNumbering(orderedContents);

  return (
    <FootnoteNumberingContext.Provider value={footnoteNumbering}>
    <div className="max-w-4xl mx-auto">
```

**c.** Find the end of the component:

```tsx
        ))}
      </div>
    </div>
  );
};

export default DocumentContinuousView;
```

Replace with:

```tsx
        ))}
      </div>

      <div className="bg-white px-6 pb-6 rounded-lg shadow-sm mt-6">
        <FootnoteList entries={footnoteEntries} />
      </div>
    </div>
    </FootnoteNumberingContext.Provider>
  );
};

export default DocumentContinuousView;
```

---

## After applying

- Insert a footnote with a link, save, reload — body and link should survive.
- Put footnotes in two sections, then add one to the first; the later numbers
  should shift in the read view without re-saving any other section.
- The number shown while editing is section-local and provisional. The final
  continuous number appears in the read view. This is inherent to editing one
  section at a time and is worth saying in the UI.
- Approval view (`TeamLeadApproval.tsx`) renders sections without the numbering
  provider, so footnotes show a bullet rather than a number there. Harmless, and
  worth wiring up separately if it proves confusing.
