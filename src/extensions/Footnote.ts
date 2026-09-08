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
