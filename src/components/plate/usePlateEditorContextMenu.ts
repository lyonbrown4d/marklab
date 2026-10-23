import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { isEqual } from 'lodash-es'
import type { PlateEditor } from 'platejs/react'
import type {
  EditorContextMenuAction,
  EditorContextMenuAdapter,
  EditorContextMenuCapabilities,
} from '@/components/EditorContextMenu'
import {
  hasExpandedPlateSelection,
  serializePlateSelectionClipboard,
  serializePlateSelectionMarkdown,
  type PlateClipboardContent,
} from '@/components/plate/plateClipboardSerialization'
import { readClipboardText, writeClipboardContent, writeClipboardText } from '@/runtime/clipboard'
import { queueFocusedEditCommand } from '@/runtime/editCommands'
import { isDesktopRuntime } from '@/runtime/desktop'

type UsePlateEditorContextMenuOptions = {
  activePath?: string | null
  getEditor: () => PlateEditor | null
  interactionActive?: boolean
  onLinkInsert?: () => void
  readOnly?: boolean
  workspaceKey?: string
}

type SelectionRef = ReturnType<PlateEditor['api']['rangeRef']>
type ClipboardTarget = {
  take: () => SelectionRef['current']
  release: () => void
}

const disabledCapabilities: EditorContextMenuCapabilities = {
  bold: false,
  copy: false,
  copyAsMarkdown: false,
  cut: false,
  inlineCode: false,
  italic: false,
  link: false,
  paste: false,
  pasteAsPlainText: false,
  redo: false,
  selectAll: false,
  strike: false,
  undo: false,
}

const getCapabilities = (
  editor: PlateEditor | null,
  readOnly: boolean,
): EditorContextMenuCapabilities => {
  if (!editor) return disabledCapabilities
  const hasSelection = hasExpandedPlateSelection(editor)
  return {
    bold: !readOnly,
    copy: hasSelection,
    copyAsMarkdown: hasSelection,
    cut: !readOnly && hasSelection,
    inlineCode: !readOnly,
    italic: !readOnly,
    link: !readOnly,
    paste: !readOnly,
    pasteAsPlainText: !readOnly,
    redo: !readOnly && editor.history.redos.length > 0,
    selectAll: true,
    strike: !readOnly,
    undo: !readOnly && editor.history.undos.length > 0,
  }
}

const markByAction: Partial<Record<EditorContextMenuAction, string>> = {
  bold: 'bold',
  inlineCode: 'code',
  italic: 'italic',
  strike: 'strikethrough',
}

const writeClipboardEvent = (event: ClipboardEvent, content: PlateClipboardContent): void => {
  if (!event.clipboardData) return
  event.preventDefault()
  event.clipboardData.setData('text/plain', content.text)
  if (content.html) event.clipboardData.setData('text/html', content.html)
  try {
    event.clipboardData.setData('text/markdown', content.markdown)
  } catch {
    // Chromium support for custom clipboard MIME types varies by platform.
  }
}

const handleClipboardEvent = (
  editor: PlateEditor,
  event: ClipboardEvent,
  readOnly: boolean,
): void => {
  if (event.type === 'cut' && readOnly) {
    event.preventDefault()
    return
  }
  const content = serializePlateSelectionClipboard(editor)
  if (!content) return
  writeClipboardEvent(event, content)
  if (isDesktopRuntime()) void writeClipboardContent(content).catch(() => undefined)
  if (event.defaultPrevented && event.type === 'cut') {
    editor.tf.withNewBatch(() => editor.tf.deleteFragment())
  }
}

const runAction = (
  editor: PlateEditor | null,
  action: EditorContextMenuAction,
  readOnly: boolean,
  onLinkInsert?: () => void,
  captureTarget?: (editor: PlateEditor) => ClipboardTarget | null,
) => {
  if (
    !editor ||
    (readOnly && action !== 'copy' && action !== 'copyAsMarkdown' && action !== 'selectAll')
  )
    return
  const mark = markByAction[action]
  if (mark) {
    editor.tf.toggleMark(mark)
    return
  }
  if (action === 'undo' || action === 'redo') {
    editor.tf[action]()
    return
  }
  if (action === 'selectAll') {
    editor.tf.selectAll()
    return
  }
  if (action === 'link') {
    onLinkInsert?.()
    return
  }
  if (action === 'paste') {
    queueFocusedEditCommand('paste')
    return
  }
  if (action === 'pasteAsPlainText') {
    const target = captureTarget?.(editor)
    if (!target) return
    void readClipboardText()
      .then((text) => {
        const range = target.take()
        if (text && range) {
          editor.tf.withNewBatch(() => {
            editor.tf.select(range)
            editor.tf.insertText(text)
          })
        }
      })
      .catch(() => undefined)
      .finally(target.release)
    return
  }
  if (action === 'copyAsMarkdown') {
    const markdown = serializePlateSelectionMarkdown(editor)
    if (markdown !== null) void writeClipboardText(markdown).catch(() => undefined)
    return
  }
  if (action === 'copy') {
    const content = serializePlateSelectionClipboard(editor)
    if (!content) return
    void writeClipboardContent(content).catch(() => queueFocusedEditCommand('copy'))
    return
  }
  if (action === 'cut') {
    const content = serializePlateSelectionClipboard(editor)
    if (!content) return
    const target = captureTarget?.(editor)
    if (!target) return
    void writeClipboardContent(content)
      .then(() => {
        const range = target.take()
        if (!range) return
        editor.tf.withNewBatch(() => {
          editor.tf.select(range)
          editor.tf.deleteFragment()
        })
      })
      .catch(() => undefined)
      .finally(target.release)
  }
}

const isPlateClipboardTarget = (editor: PlateEditor, target: EventTarget | null): boolean => {
  const root = editor.api.toDOMNode(editor)
  if (!root) return false
  if (target instanceof Node && root.contains(target)) return true
  const anchor = window.getSelection()?.anchorNode
  return anchor instanceof Node && root.contains(anchor)
}

export const usePlateEditorContextMenu = ({
  activePath,
  getEditor,
  interactionActive = true,
  onLinkInsert,
  readOnly = false,
  workspaceKey,
}: UsePlateEditorContextMenuOptions): EditorContextMenuAdapter => {
  const generation = useRef(0)
  const pendingTargets = useRef(new Set<SelectionRef>())
  useLayoutEffect(() => {
    const targets = pendingTargets.current
    return () => {
      generation.current += 1
      targets.forEach((target) => target.unref())
      targets.clear()
    }
  }, [activePath, interactionActive, readOnly, workspaceKey])
  useEffect(() => {
    const handleEvent = (event: ClipboardEvent) => {
      const editor = getEditor()
      if (!editor) return
      try {
        if (!isPlateClipboardTarget(editor, event.target)) return
        handleClipboardEvent(editor, event, readOnly)
      } catch {
        // Leave the event untouched so the browser's native clipboard path remains available.
      }
    }
    document.addEventListener('copy', handleEvent, true)
    document.addEventListener('cut', handleEvent, true)
    return () => {
      document.removeEventListener('copy', handleEvent, true)
      document.removeEventListener('cut', handleEvent, true)
    }
  }, [getEditor, readOnly])

  return useMemo(() => {
    const captureTarget = (editor: PlateEditor): ClipboardTarget | null => {
      if (!editor.selection) return null
      const target = editor.api.rangeRef(editor.selection, { affinity: 'inward' })
      const sourceFragment = editor.api.fragment(editor.selection)
      const requestGeneration = generation.current
      pendingTargets.current.add(target)
      const release = () => {
        pendingTargets.current.delete(target)
        target.unref()
      }
      return {
        release,
        take: () => {
          const range = target.current
          if (
            generation.current !== requestGeneration ||
            getEditor() !== editor ||
            !range ||
            !isEqual(editor.api.fragment(range), sourceFragment)
          )
            return null
          return range
        },
      }
    }
    return {
      getCapabilities: () => getCapabilities(interactionActive ? getEditor() : null, readOnly),
      onAction: (action) =>
        runAction(
          interactionActive ? getEditor() : null,
          action,
          readOnly,
          onLinkInsert,
          captureTarget,
        ),
    }
  }, [getEditor, interactionActive, onLinkInsert, readOnly])
}
