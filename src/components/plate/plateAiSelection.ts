import clamp from 'lodash-es/clamp'
import type { PlateEditor } from 'platejs/react'
import type { TRange } from 'platejs'
import { serializeMd } from '@platejs/markdown'

export type PlateAiSelectionCapture = {
  anchor: { left: number; top: number }
  documentPath: string | null
  documentSnapshot: string
  editor: PlateEditor
  range: TRange
  selectionSnapshot: TRange
  sourceText: string
}

export type PlateAiReplacementResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'path-changed'
        | 'document-changed'
        | 'selection-changed'
        | 'editor-changed'
        | 'editor-unavailable'
    }

const PANEL_WIDTH = 576
const PANEL_MIN_HEIGHT = 180
const VIEWPORT_GUTTER = 8

const samePoint = (left: TRange['anchor'], right: TRange['anchor']) =>
  left.offset === right.offset &&
  left.path.length === right.path.length &&
  left.path.every((segment, index) => segment === right.path[index])

const sameRange = (left: TRange | null, right: TRange) =>
  left !== null && samePoint(left.anchor, right.anchor) && samePoint(left.focus, right.focus)

const captureRange = (editor: PlateEditor): TRange | null => {
  const selection = editor.selection
  if (!selection) return null
  if (editor.api.isExpanded()) return selection
  const block = editor.api.block()
  return block ? (editor.api.range(block[1]) ?? null) : selection
}

const captureAnchor = (root: HTMLElement) => {
  const viewportRect = root.getBoundingClientRect()
  const domSelection = window.getSelection()
  const rangeRect = domSelection?.rangeCount
    ? domSelection.getRangeAt(0).getBoundingClientRect()
    : null
  const renderedWidth = Math.min(PANEL_WIDTH, Math.max(0, viewportRect.width - VIEWPORT_GUTTER * 2))
  const maxLeft = Math.max(VIEWPORT_GUTTER, viewportRect.width - renderedWidth - VIEWPORT_GUTTER)
  const maxTop = Math.max(VIEWPORT_GUTTER, viewportRect.height - PANEL_MIN_HEIGHT - VIEWPORT_GUTTER)
  return {
    left: clamp(
      (rangeRect?.left ?? viewportRect.left) - viewportRect.left,
      VIEWPORT_GUTTER,
      maxLeft,
    ),
    top: clamp(
      (rangeRect?.bottom ?? viewportRect.top) - viewportRect.top + VIEWPORT_GUTTER,
      VIEWPORT_GUTTER,
      maxTop,
    ),
  }
}

export const capturePlateAiSelection = (
  editor: PlateEditor,
  documentPath: string | null,
  root: HTMLElement,
): PlateAiSelectionCapture | null => {
  if (!editor.selection) return null
  const range = captureRange(editor)
  if (!range) return null
  return {
    anchor: captureAnchor(root),
    documentPath,
    documentSnapshot: serializeMd(editor),
    editor,
    range,
    selectionSnapshot: editor.selection,
    sourceText: editor.api.string(range),
  }
}

export const isPlateAiSelectionCaptureUsable = (
  editor: PlateEditor | null,
  capture: PlateAiSelectionCapture,
) => editor === capture.editor && editor.selection !== null

export const applyPlateAiReplacement = (
  editor: PlateEditor | null,
  capture: PlateAiSelectionCapture,
  documentPath: string | null,
  replacement: string,
): PlateAiReplacementResult => {
  if (!editor || !editor.selection) return { ok: false, reason: 'editor-unavailable' }
  if (editor !== capture.editor) return { ok: false, reason: 'editor-changed' }
  if (documentPath !== capture.documentPath) return { ok: false, reason: 'path-changed' }
  if (serializeMd(editor) !== capture.documentSnapshot) {
    return { ok: false, reason: 'document-changed' }
  }
  if (!sameRange(editor.selection, capture.selectionSnapshot)) {
    return { ok: false, reason: 'selection-changed' }
  }

  editor.tf.select(capture.range)
  editor.tf.insertText(replacement)
  return { ok: true }
}
