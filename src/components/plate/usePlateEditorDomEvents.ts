import { registerPlateHistory } from '@/lib/focusedPlateHistory'
import { isVimKeyboardTarget } from '@/components/vim/vimKeyboardScope'
import type { PlateEditor } from 'platejs/react'
import { BlockSelectionPlugin } from '@platejs/selection/react'
import { useEffect, type RefObject } from 'react'
import type { PlateSurfaceCompletionBindings } from '@/components/plate/usePlateSurfaceCompletions'
import { handlePlateEditorShortcut } from '@/components/plate/plateEditorShortcuts'
import { setPlateMarkdownInputRulesComposing } from '@/components/plate/plateMarkdownInputRules'
import {
  getFocusedTopLevelBlockId,
  handlePlateBlockMoveShortcut,
} from '@/components/plate/selection/plateBlockSelection'
import type { PlateEditorSurfaceProps } from '@/components/plate/plateEditorSurfaceTypes'
import type { PlateSlashCommandsController } from '@/components/plate/slash'

type PlateEditorDomEventsOptions = {
  applyPendingExternal: () => boolean
  completion: Pick<
    PlateSurfaceCompletionBindings,
    'onBlur' | 'onCompositionEnd' | 'onCompositionStart' | 'onKeyDown'
  >
  composingRef: RefObject<boolean>
  editableRef: RefObject<HTMLDivElement | null>
  editor: PlateEditor
  flushSnapshot: () => void
  onSlashKeyDown: PlateSlashCommandsController['onKeyDown']
  openLinkInput: () => boolean
  pickAndImportImage: () => unknown
  queueSnapshot: () => void
  readOnly: boolean
  isReady: () => boolean
  shortcutOverrides: PlateEditorSurfaceProps['shortcutOverrides']
}

export const usePlateEditorDomEvents = ({
  applyPendingExternal,
  completion,
  composingRef,
  editableRef,
  editor,
  flushSnapshot,
  onSlashKeyDown,
  openLinkInput,
  pickAndImportImage,
  queueSnapshot,
  readOnly,
  isReady,
  shortcutOverrides,
}: PlateEditorDomEventsOptions) => {
  useEffect(() => {
    const editable = editableRef.current
    if (!editable) return
    // Desktop menu accelerators bypass Slate's keyboard handler. Use its own
    // history rather than the webview's native contenteditable undo stack.
    const releaseHistory = registerPlateHistory(editable, (action) => {
      if (!readOnly && isReady() && !composingRef.current) editor.tf[action]()
    })
    let compositionEndTimer: number | undefined
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isVimKeyboardTarget(event.target)) return
      if (!isReady()) {
        event.preventDefault()
        return
      }
      if (readOnly) return
      if (handlePlateBlockMoveShortcut(editor, event, getFocusedTopLevelBlockId(editor))) {
        return
      }
      if (completion.onKeyDown(event)) return
      if (!onSlashKeyDown(event)) {
        handlePlateEditorShortcut(editor, event, shortcutOverrides, {
          onImageImport: () => void pickAndImportImage(),
          onLinkInsert: openLinkInput,
        })
      }
    }
    const handleCompositionStart = () => {
      if (!isReady()) return
      if (compositionEndTimer !== undefined) window.clearTimeout(compositionEndTimer)
      composingRef.current = true
      setPlateMarkdownInputRulesComposing(editor, true)
      completion.onCompositionStart()
    }
    const handleCompositionEnd = () => {
      completion.onCompositionEnd()
      compositionEndTimer = window.setTimeout(() => {
        compositionEndTimer = undefined
        composingRef.current = false
        setPlateMarkdownInputRulesComposing(editor, false)
        if (isReady() && !applyPendingExternal()) queueSnapshot()
      })
    }
    const handleBlur = (event: FocusEvent) => {
      if (editor.plugins[BlockSelectionPlugin.key]) {
        const { selectedIds, shadowInputRef } = editor.getOptions(BlockSelectionPlugin)
        const shadowInput = shadowInputRef?.current
        if ((selectedIds?.size ?? 0) > 0 && shadowInput && event.relatedTarget === shadowInput) {
          // Slate flushes its deferred DOM selection during blur. The previous
          // text caret must not overwrite the block selection taking focus.
          editable.ownerDocument.getSelection()?.removeAllRanges()
        }
      }
      completion.onBlur()
      if (compositionEndTimer !== undefined) return
      if (!applyPendingExternal()) flushSnapshot()
    }
    const handleBeforeInput = (event: InputEvent) => {
      if (!isReady()) event.preventDefault()
    }
    const handleBlockedMutation = (event: Event) => {
      if (isReady()) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    editable.addEventListener('beforeinput', handleBeforeInput, { capture: true })
    editable.addEventListener('cut', handleBlockedMutation, { capture: true })
    editable.addEventListener('drop', handleBlockedMutation, { capture: true })
    editable.addEventListener('keydown', handleKeyDown, { capture: true })
    editable.addEventListener('paste', handleBlockedMutation, { capture: true })
    editable.addEventListener('compositionstart', handleCompositionStart, { capture: true })
    editable.addEventListener('compositionend', handleCompositionEnd, { capture: true })
    editable.addEventListener('blur', handleBlur)
    return () => {
      releaseHistory()
      if (compositionEndTimer !== undefined) window.clearTimeout(compositionEndTimer)
      editable.removeEventListener('beforeinput', handleBeforeInput, { capture: true })
      editable.removeEventListener('cut', handleBlockedMutation, { capture: true })
      editable.removeEventListener('drop', handleBlockedMutation, { capture: true })
      editable.removeEventListener('keydown', handleKeyDown, { capture: true })
      editable.removeEventListener('paste', handleBlockedMutation, { capture: true })
      editable.removeEventListener('compositionstart', handleCompositionStart, { capture: true })
      editable.removeEventListener('compositionend', handleCompositionEnd, { capture: true })
      editable.removeEventListener('blur', handleBlur)
    }
  }, [
    applyPendingExternal,
    completion,
    composingRef,
    editableRef,
    editor,
    flushSnapshot,
    onSlashKeyDown,
    openLinkInput,
    pickAndImportImage,
    queueSnapshot,
    readOnly,
    isReady,
    shortcutOverrides,
  ])
}
