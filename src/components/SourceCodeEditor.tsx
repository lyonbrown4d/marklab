import { useCallback, useEffect, useRef } from 'react'
import { useLatest } from 'ahooks'
import { useStore } from 'zustand'
import type { EditorCursorPosition } from '@/components/EditorDocumentStatus'
import type { OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useDarkMode } from '@/hooks/useDarkMode'
import { MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER } from '@/logic/markdownDiagnostics'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import {
  clearFocusSourcePositionRequest,
  onFocusSourcePositionRequest,
  sourcePositionNavigationStore,
  type FocusSourcePositionRequest,
  type PendingFocusSourcePositionRequest,
} from '@/utils/editorNavigation'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import { registerMarkdownSourceProviders } from '@/components/markdownSourceProviders'
import { SourceCodeEditorSurface } from '@/components/SourceCodeEditorSurface'
import { useI18n } from '@/i18n/useI18n'
import { clearFocusedCodeEditor, setFocusedCodeEditor } from '@/lib/focusedCodeEditor'
import { registerMarkdownSourceShortcuts } from '@/components/markdownSourceShortcuts'
import { useSourceCodeContextMenu } from '@/components/sourceCodeContextMenu'
import {
  useMarkdownSourceDiagnostics,
  type MarkdownSourceDiagnosticHost,
} from '@/components/useMarkdownSourceDiagnostics'
import type { EditorChangeHandler } from '@/types/editorChanges'
import { useEditorFocusHandoffTarget } from '@/app/EditorFocusHandoff'
import { useConfiguredMonaco } from '@/components/source-code/useConfiguredMonaco'

type SourceCodeEditorProps = {
  activePath: string | null
  workspaceKey: string
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  onChange: EditorChangeHandler
  onOpenFileView?: (path: string, view: FileViewKind) => void
  onCursorChange?: (position: EditorCursorPosition | null) => void
  readOnly?: boolean
}

const SourceCodeEditor = ({
  activePath,
  workspaceKey,
  value,
  files,
  fileContents,
  onChange,
  onOpenFileView,
  onCursorChange,
  readOnly = false,
}: SourceCodeEditorProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const sourceCodeMiniMapEnabled = usePreferencesStore((state) => state.sourceCodeMiniMapEnabled)
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const markdownEnabled = isMarkdownFilePath(activePath ?? '')
  const { error: monacoLoadError, ready: monacoReady } = useConfiguredMonaco()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const cursorCallbackRef = useLatest(onCursorChange)
  const workspaceKeyRef = useLatest(workspaceKey)
  const cursorSubscriptionRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticHostRef = useRef<MarkdownSourceDiagnosticHost | null>(null)
  const providersDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const shortcutsDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const searchHighlightRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const searchHighlightTimerRef = useRef<number | null>(null)
  const { completionContextRef, scheduleDiagnostics } = useMarkdownSourceDiagnostics({
    activePath,
    enabled: markdownEnabled,
    files,
    fileContents,
    hostRef: diagnosticHostRef,
  })
  const pendingSourcePosition = useStore(sourcePositionNavigationStore, (state) =>
    activePath ? state.requests[`${workspaceKey}:${activePath}`] : undefined,
  )
  const pendingSourcePositionRef = useRef<FocusSourcePositionRequest | null>(null)
  const previousMarkdownEnabledRef = useRef(markdownEnabled)
  const contextMenu = useSourceCodeContextMenu(editorRef, readOnly)
  const focusEditor = useCallback(() => editorRef.current?.focus(), [])
  const isEditorMounted = useCallback(() => editorRef.current !== null, [])
  const focusHandoff = useEditorFocusHandoffTarget({
    focus: focusEditor,
    isReady: isEditorMounted,
    path: activePath,
    status: monacoLoadError ? 'error' : 'loading',
    view: 'source',
  })

  useEffect(() => {
    const navigationKey = activePath ? `${workspaceKey}:${activePath}` : null

    return () => {
      pendingSourcePositionRef.current = null
      if (!navigationKey) return
      const previousRequest = sourcePositionNavigationStore.getState().requests[navigationKey]
      if (previousRequest) clearFocusSourcePositionRequest(previousRequest)
    }
  }, [activePath, workspaceKey])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    focusHandoff.reportReady()
    cursorSubscriptionRef.current?.dispose()
    cursorSubscriptionRef.current = editor.onDidChangeCursorPosition(({ position }) => {
      cursorCallbackRef.current?.(position)
    })
    cursorCallbackRef.current?.(editor.getPosition())
    setFocusedCodeEditor(editor)
    diagnosticHostRef.current = { editor, monaco: monaco as typeof import('monaco-editor') }

    providersDisposableRef.current?.dispose()
    providersDisposableRef.current = markdownEnabled
      ? registerMarkdownSourceProviders({
          monaco: monaco as typeof import('monaco-editor'),
          editor,
          getContext: () => completionContextRef.current,
          getWorkspaceKey: () => workspaceKeyRef.current,
          onOpenFileView,
          scheduleDiagnostics,
        })
      : null
    shortcutsDisposableRef.current?.dispose()
    shortcutsDisposableRef.current =
      readOnly || !markdownEnabled
        ? null
        : registerMarkdownSourceShortcuts({ editor, overrides: shortcutOverrides })

    scheduleDiagnostics()
    const pending =
      pendingSourcePositionRef.current ??
      (activePath
        ? sourcePositionNavigationStore.getState().requests[`${workspaceKey}:${activePath}`]
        : undefined)
    if (pending) focusSourcePosition(pending)
  }

  useEffect(() => {
    if (onCursorChange && editorRef.current) onCursorChange(editorRef.current.getPosition())
  }, [activePath, onCursorChange])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    shortcutsDisposableRef.current?.dispose()
    shortcutsDisposableRef.current =
      readOnly || !markdownEnabled
        ? null
        : registerMarkdownSourceShortcuts({ editor, overrides: shortcutOverrides })
  }, [markdownEnabled, readOnly, shortcutOverrides])

  useEffect(() => {
    if (previousMarkdownEnabledRef.current === markdownEnabled) return
    previousMarkdownEnabledRef.current = markdownEnabled
    const host = diagnosticHostRef.current
    if (!host) return

    providersDisposableRef.current?.dispose()
    providersDisposableRef.current = markdownEnabled
      ? registerMarkdownSourceProviders({
          monaco: host.monaco,
          editor: host.editor,
          getContext: () => completionContextRef.current,
          getWorkspaceKey: () => workspaceKeyRef.current,
          onOpenFileView,
          scheduleDiagnostics,
        })
      : null
    scheduleDiagnostics()
  }, [completionContextRef, markdownEnabled, onOpenFileView, scheduleDiagnostics, workspaceKeyRef])

  useEffect(() => {
    return () => {
      cursorSubscriptionRef.current?.dispose()
      providersDisposableRef.current?.dispose()
      providersDisposableRef.current = null
      shortcutsDisposableRef.current?.dispose()
      shortcutsDisposableRef.current = null
      if (searchHighlightTimerRef.current !== null) {
        window.clearTimeout(searchHighlightTimerRef.current)
        searchHighlightTimerRef.current = null
      }
      searchHighlightRef.current?.clear()
      searchHighlightRef.current = null

      const host = diagnosticHostRef.current
      const model = host?.editor.getModel()
      if (host && model) {
        host.monaco.editor.setModelMarkers(model, MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER, [])
      }
      if (host) {
        clearFocusedCodeEditor(host.editor)
      }
      diagnosticHostRef.current = null
      editorRef.current = null
      pendingSourcePositionRef.current = null
    }
  }, [])

  const focusSourcePosition = useCallback(
    (request: FocusSourcePositionRequest) => {
      const { path, line, column, endColumn } = request
      if (request.workspaceKey && request.workspaceKey !== workspaceKeyRef.current) return
      if (!path || path !== completionContextRef.current.activePath) return
      if (!Number.isFinite(line) || !Number.isFinite(column)) return

      const editor = editorRef.current
      const monaco = diagnosticHostRef.current?.monaco
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
    [completionContextRef, workspaceKeyRef],
  )

  useEffect(() => {
    if (pendingSourcePosition) focusSourcePosition(pendingSourcePosition)
  }, [focusSourcePosition, pendingSourcePosition])
  useEffect(() => onFocusSourcePositionRequest(focusSourcePosition), [focusSourcePosition])

  const editorLoadError =
    monacoLoadError instanceof Error ? monacoLoadError.message : String(monacoLoadError)

  return (
    <SourceCodeEditorSurface
      activePath={activePath}
      workspaceKey={workspaceKey}
      darkMode={darkMode}
      errorMessage={
        monacoLoadError ? t('editor.sourceLoadFailed', { error: editorLoadError }) : null
      }
      immersiveFocusMode={immersiveFocusMode}
      immersiveTypewriterMode={immersiveTypewriterMode}
      immersiveZenMode={immersiveZenMode}
      loadingLabel={t('editor.sourceLoading')}
      monacoReady={monacoReady}
      motionAnimatedCursor={motionAnimatedCursor}
      motionSmoothScrolling={motionSmoothScrolling}
      readOnly={readOnly}
      sourceCodeMiniMapEnabled={sourceCodeMiniMapEnabled}
      shortcutOverrides={shortcutOverrides}
      value={value}
      contextMenu={contextMenu}
      onChange={onChange}
      onMount={handleMount}
    />
  )
}

export default SourceCodeEditor
