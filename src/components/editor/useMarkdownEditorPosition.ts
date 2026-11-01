import { useLayoutEffect, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { LRUCache } from 'lru-cache'
import type { TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { headingNavigationStore, sourcePositionNavigationStore } from '@/utils/editorNavigation'

type EditorPosition = {
  revision: string | null
  selection: TRange | null
  scrollTop: number
  scrollLeft: number
  scrollRatio: number
}

// Positions survive route eviction without retaining editor instances or document text.
const positions = new LRUCache<string, EditorPosition>({ max: 64 })
const fingerprint = (editor: PlateEditor): string | null => {
  let hash = 2166136261
  const token = (value: string) => {
    hash = Math.imul(hash ^ value.length, 16777619)
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
    }
  }
  const visit = (value: unknown, depth: number): void => {
    if (depth > 100) throw new Error('Editor tree is too deeply nested')
    if (Array.isArray(value)) {
      token(`array:${value.length}`)
      for (const child of value) visit(child, depth + 1)
    } else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      // Plate regenerates node IDs when a route is recreated; IDs do not change content.
      for (const key of Object.keys(record)
        .filter((key) => key !== 'id')
        .sort()) {
        token(key)
        visit(record[key], depth + 1)
      }
      token('end')
    } else token(`${typeof value}:${String(value)}`)
  }
  try {
    visit(editor.children, 0)
    return String(hash >>> 0)
  } catch {
    return null
  }
}
const cloneSelection = (selection: TRange | null): TRange | null =>
  selection
    ? {
        anchor: { path: [...selection.anchor.path], offset: selection.anchor.offset },
        focus: { path: [...selection.focus.path], offset: selection.focus.offset },
      }
    : null
const validSelection = (editor: PlateEditor, selection: TRange) =>
  [selection.anchor, selection.focus].every((point) => {
    const entry = editor.api.node(point.path)
    return Boolean(
      entry &&
      'text' in entry[0] &&
      typeof entry[0].text === 'string' &&
      point.offset >= 0 &&
      point.offset <= entry[0].text.length,
    )
  })

type MarkdownEditorPositionOptions = {
  activePath: string | null
  workspaceKey?: string
  active: boolean
  ready: boolean
  rootRef: RefObject<HTMLDivElement | null>
  getEditor: () => PlateEditor | null
}

export const useMarkdownEditorPosition = ({
  activePath,
  workspaceKey,
  active,
  ready,
  rootRef,
  getEditor,
}: MarkdownEditorPositionOptions) => {
  const latestGetEditor = useLatest(getEditor)
  useLayoutEffect(() => {
    if (!activePath || !workspaceKey || !active || !ready) return
    const key = `${workspaceKey}:${activePath}`
    const editor = latestGetEditor.current()
    const editable = rootRef.current?.querySelector<HTMLElement>('[data-editor-engine="plate"]')
    if (!editor || !editable) return
    const hasNavigationRequest = () =>
      Boolean(
        headingNavigationStore.getState().requests[key] ||
        sourcePositionNavigationStore.getState().requests[key],
      )
    const saved = positions.get(key)
    let frame: number | null = null
    let navigated = hasNavigationRequest()
    const stopRestore = () => {
      navigated = true
    }
    const unsubscribeHeading = headingNavigationStore.subscribe((state) => {
      if (state.requests[key]) stopRestore()
    })
    const unsubscribeSource = sourcePositionNavigationStore.subscribe((state) => {
      if (state.requests[key]) stopRestore()
    })
    // Let native layout/chunking settle. Explicit heading/source requests always win.
    if (saved && !navigated)
      frame = window.requestAnimationFrame(() => {
        frame = null
        if (navigated || hasNavigationRequest()) return
        const sameContent = saved.revision !== null && saved.revision === fingerprint(editor)
        if (sameContent && saved.selection && validSelection(editor, saved.selection))
          editor.tf.select(saved.selection)
        editable.scrollTop = sameContent
          ? saved.scrollTop
          : saved.scrollRatio * Math.max(0, editable.scrollHeight - editable.clientHeight)
        editable.scrollLeft = saved.scrollLeft
      })
    return () => {
      unsubscribeHeading()
      unsubscribeSource()
      if (frame !== null) window.cancelAnimationFrame(frame)
      positions.set(key, {
        revision: fingerprint(editor),
        selection: cloneSelection(editor.selection),
        scrollTop: editable.scrollTop,
        scrollLeft: editable.scrollLeft,
        scrollRatio:
          editable.scrollTop / Math.max(1, editable.scrollHeight - editable.clientHeight),
      })
    }
  }, [active, activePath, latestGetEditor, ready, rootRef, workspaceKey])
}
