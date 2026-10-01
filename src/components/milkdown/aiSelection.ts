import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import type { EditorView } from '@milkdown/kit/prose/view'
import clamp from 'lodash-es/clamp'

export type AiSelectionCapture = {
  anchor: { left: number; top: number }
  documentPath: string | null
  documentSnapshot: ProseMirrorNode
  editorView: EditorView
  range: { from: number; to: number }
  selectionSnapshot: { from: number; to: number }
  sourceText: string
}

export type AiReplacementResult =
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

const captureRange = (view: EditorView) => {
  const { selection } = view.state
  if (!selection.empty) return { from: selection.from, to: selection.to }
  const resolved = selection.$from
  if (!resolved.parent.isTextblock) return { from: selection.from, to: selection.to }
  return { from: resolved.start(), to: resolved.end() }
}

const captureAnchorPosition = (view: EditorView, range: { from: number; to: number }) => {
  const candidates = [view.state.selection.$to]
  if (range.to > range.from) candidates.push(view.state.doc.resolve(range.to - 1))
  for (const resolved of candidates) {
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      if (resolved.node(depth).isTextblock) return resolved.end(depth)
    }
  }
  return range.to
}

const captureAnchor = (view: EditorView, position: number) => {
  const viewport = view.dom.closest<HTMLElement>('.crepe') ?? view.dom
  const viewportRect = viewport.getBoundingClientRect()
  let caret = {
    left: viewportRect.left + VIEWPORT_GUTTER,
    bottom: viewportRect.top + VIEWPORT_GUTTER,
  }
  try {
    caret = view.coordsAtPos(position)
  } catch {
    // A deterministic in-viewport fallback is safer than losing the command surface.
  }
  const renderedWidth = Math.min(PANEL_WIDTH, Math.max(0, viewportRect.width - VIEWPORT_GUTTER * 2))
  const maxLeft = Math.max(VIEWPORT_GUTTER, viewportRect.width - renderedWidth - VIEWPORT_GUTTER)
  const maxTop = Math.max(VIEWPORT_GUTTER, viewportRect.height - PANEL_MIN_HEIGHT - VIEWPORT_GUTTER)
  return {
    left: clamp(caret.left - viewportRect.left, VIEWPORT_GUTTER, maxLeft),
    top: clamp(caret.bottom - viewportRect.top + VIEWPORT_GUTTER, VIEWPORT_GUTTER, maxTop),
  }
}

export const captureAiSelection = (
  view: EditorView,
  documentPath: string | null,
): AiSelectionCapture | null => {
  if (view.isDestroyed || !view.editable) return null
  const range = captureRange(view)
  return {
    anchor: captureAnchor(view, captureAnchorPosition(view, range)),
    documentPath,
    documentSnapshot: view.state.doc,
    editorView: view,
    range,
    selectionSnapshot: {
      from: view.state.selection.from,
      to: view.state.selection.to,
    },
    sourceText: view.state.doc.textBetween(range.from, range.to, '\n', '\n'),
  }
}

export const isAiSelectionCaptureUsable = (view: EditorView | null, capture: AiSelectionCapture) =>
  view === capture.editorView && !capture.editorView.isDestroyed && capture.editorView.editable

export const applyAiReplacement = (
  view: EditorView,
  capture: AiSelectionCapture,
  documentPath: string | null,
  replacement: string,
): AiReplacementResult => {
  if (view.isDestroyed || !view.editable) return { ok: false, reason: 'editor-unavailable' }
  if (view !== capture.editorView) return { ok: false, reason: 'editor-changed' }
  if (documentPath !== capture.documentPath) return { ok: false, reason: 'path-changed' }
  if (!view.state.doc.eq(capture.documentSnapshot)) {
    return { ok: false, reason: 'document-changed' }
  }
  const { from, to } = view.state.selection
  if (from !== capture.selectionSnapshot.from || to !== capture.selectionSnapshot.to) {
    return { ok: false, reason: 'selection-changed' }
  }

  const expectedSelection = capture.range
  view.dispatch(
    view.state.tr
      .insertText(replacement, expectedSelection.from, expectedSelection.to)
      .scrollIntoView(),
  )
  view.focus()
  return { ok: true }
}
