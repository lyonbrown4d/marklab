import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { useStore } from 'zustand'
import type { editor as MonacoEditor } from 'monaco-editor'
import type { MarkdownSourceDiagnosticHost } from '@/components/useMarkdownSourceDiagnostics'
import {
  clearFocusSourcePositionRequest,
  onFocusSourcePositionRequest,
  sourcePositionNavigationStore,
  type FocusSourcePositionRequest,
  type PendingFocusSourcePositionRequest,
} from '@/utils/editorNavigation'

type SourceCodePositionNavigationOptions = {
  active: boolean
  activePath: string | null
  workspaceKey: string
  editorRef: RefObject<MonacoEditor.IStandaloneCodeEditor | null>
  hostRef: RefObject<MarkdownSourceDiagnosticHost | null>
}

export const useSourceCodePositionNavigation = ({
  active,
  activePath,
  workspaceKey,
  editorRef,
  hostRef,
}: SourceCodePositionNavigationOptions) => {
  const activeRef = useLatest(active)
  const pathRef = useLatest(activePath)
  const workspaceKeyRef = useLatest(workspaceKey)
  const isActive = useCallback(() => activeRef.current, [activeRef])
  const searchHighlightRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const searchHighlightTimerRef = useRef<number | null>(null)
  const pendingSourcePositionRef = useRef<FocusSourcePositionRequest | null>(null)
  const pendingSourcePosition = useStore(sourcePositionNavigationStore, (state) =>
    activePath ? state.requests[`${workspaceKey}:${activePath}`] : undefined,
  )
  const focusSourcePosition = useCallback(
    (request: FocusSourcePositionRequest) => {
      if (!activeRef.current) return
      const { path, line, column, endColumn } = request
      if (request.workspaceKey && request.workspaceKey !== workspaceKeyRef.current) return
      if (!path || path !== pathRef.current) return
      if (!Number.isFinite(line) || !Number.isFinite(column)) return

      const editor = editorRef.current
      const monaco = hostRef.current?.monaco
      if (!editor || !monaco) {
        pendingSourcePositionRef.current = request
        return
      }
      pendingSourcePositionRef.current = null

      const lineNumber = Math.max(1, line)
      const columnNumber = Math.max(1, column)
      const endColumnNumber = Math.max(columnNumber + 1, endColumn ?? columnNumber + 1)
      const range = new monaco.Range(lineNumber, columnNumber, lineNumber, endColumnNumber)
      editor.setPosition({ lineNumber, column: columnNumber })
      editor.setSelection(range)
      editor.revealRangeInCenter(range)
      editor.focus()

      searchHighlightRef.current ??= editor.createDecorationsCollection()
      searchHighlightRef.current.set([
        {
          range,
          options: {
            className: 'marklab-search-hit-line',
            inlineClassName: 'marklab-search-hit-inline',
          },
        },
      ])
      if (searchHighlightTimerRef.current !== null) {
        window.clearTimeout(searchHighlightTimerRef.current)
      }
      searchHighlightTimerRef.current = window.setTimeout(() => {
        searchHighlightRef.current?.clear()
        searchHighlightTimerRef.current = null
      }, 2_400)
      if (request.workspaceKey) {
        clearFocusSourcePositionRequest(request as PendingFocusSourcePositionRequest)
      }
    },
    [activeRef, editorRef, hostRef, pathRef, workspaceKeyRef],
  )

  useEffect(() => {
    if (active && pendingSourcePosition) focusSourcePosition(pendingSourcePosition)
  }, [active, focusSourcePosition, pendingSourcePosition])
  useEffect(() => onFocusSourcePositionRequest(focusSourcePosition), [focusSourcePosition])

  useEffect(() => {
    const navigationKey = activePath ? `${workspaceKey}:${activePath}` : null
    return () => {
      if (searchHighlightTimerRef.current !== null)
        window.clearTimeout(searchHighlightTimerRef.current)
      searchHighlightRef.current?.clear()
      pendingSourcePositionRef.current = null
      if (!isActive() || !navigationKey) return
      const pending = sourcePositionNavigationStore.getState().requests[navigationKey]
      if (pending) clearFocusSourcePositionRequest(pending)
    }
  }, [activePath, isActive, workspaceKey])

  return () => {
    const pending =
      pendingSourcePositionRef.current ??
      (activePath
        ? sourcePositionNavigationStore.getState().requests[`${workspaceKey}:${activePath}`]
        : undefined)
    if (pending) focusSourcePosition(pending)
  }
}
