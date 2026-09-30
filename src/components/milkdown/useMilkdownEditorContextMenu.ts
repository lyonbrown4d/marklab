import { useMemo, type RefObject } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import { redo, undo } from '@milkdown/kit/prose/history'
import { AllSelection } from '@milkdown/kit/prose/state'
import type {
  EditorContextMenuAction,
  EditorContextMenuAdapter,
  EditorContextMenuCapabilities,
} from '@/components/EditorContextMenu'
import { runMarkdownEditorShortcut } from '@/components/milkdown/editorShortcuts'
import type { ShortcutActionId } from '@/logic/shortcuts'
import {
  captureSlashUrlInsertion,
  type SlashUrlInsertionRequest,
} from '@/components/milkdown/slashUrlInsertion'
import { pasteTextFromClipboard } from '@/components/milkdown/editorContextMenuClipboard'

const shortcutActionByMenuAction: Partial<Record<EditorContextMenuAction, ShortcutActionId>> = {
  bold: 'editor.bold',
  inlineCode: 'editor.inlineCode',
  italic: 'editor.italic',
  link: 'editor.link',
  strike: 'editor.strike',
}

type UseMilkdownEditorContextMenuOptions = {
  crepeRef: RefObject<Crepe | null>
  onLinkInsert: (request: SlashUrlInsertionRequest) => void
}

export const useMilkdownEditorContextMenu = ({
  crepeRef,
  onLinkInsert,
}: UseMilkdownEditorContextMenuOptions): EditorContextMenuAdapter =>
  useMemo(
    () => ({
      getCapabilities: () => getCapabilities(crepeRef.current),
      onAction: (action) => runAction(crepeRef.current, action, onLinkInsert),
    }),
    [crepeRef, onLinkInsert],
  )

const getCapabilities = (crepe: Crepe | null): EditorContextMenuCapabilities => {
  if (!crepe) return disabledCapabilities
  return crepe.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    const hasSelection = !view.state.selection.empty
    return {
      copy: hasSelection,
      cut: hasSelection,
      link: true,
      redo: redo(view.state),
      undo: undo(view.state),
    }
  })
}

const runAction = (
  crepe: Crepe | null,
  action: EditorContextMenuAction,
  onLinkInsert: (request: SlashUrlInsertionRequest) => void,
) => {
  const shortcutAction = shortcutActionByMenuAction[action]
  if (shortcutAction) {
    runMarkdownEditorShortcut(crepe, shortcutAction, {
      onLinkInsert: (ctx) =>
        onLinkInsert(captureSlashUrlInsertion(ctx, 'link', { consumeSlash: false })),
    })
    return
  }
  crepe?.editor.action((ctx) => {
    const view = ctx.get(editorViewCtx)
    if (action === 'undo' || action === 'redo') {
      const command = action === 'undo' ? undo : redo
      command(view.state, view.dispatch)
      view.focus()
      return
    }
    if (action === 'selectAll') {
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
      view.focus()
      return
    }
    if (action === 'paste') {
      void pasteTextFromClipboard(view)
      return
    }
    view.focus()
    document.execCommand?.(action)
  })
}

const disabledCapabilities: EditorContextMenuCapabilities = {
  bold: false,
  copy: false,
  cut: false,
  inlineCode: false,
  italic: false,
  link: false,
  paste: false,
  redo: false,
  selectAll: false,
  strike: false,
  undo: false,
}
