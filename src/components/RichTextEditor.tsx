
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

        <Button
          variant="ghost"
          size="sm"
          onClick={startLink}
          className={editor.isActive('link') ? 'bg-gray-200' : ''}
          title="Tilføj link"
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
          title="Fodnote"
        >
          <Superscript className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

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
        <div className="flex items-end gap-2 p-2 border-b border-gray-200 bg-white">
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
