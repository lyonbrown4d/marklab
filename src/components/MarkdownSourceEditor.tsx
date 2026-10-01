import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import type { EditorCursorPosition } from '@/components/EditorDocumentStatus'
import type { OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useDarkMode } from '@/hooks/useDarkMode'
import { MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER } from '@/logic/markdownDiagnostics'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import {
  onFocusSourcePositionRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { registerMarkdownSourceProviders } from '@/components/markdownSourceProviders'
import { MarkdownSourceEditorSurface } from '@/components/MarkdownSourceEditorSurface'
import { useI18n } from '@/i18n/useI18n'
import { clearFocusedCodeEditor, setFocusedCodeEditor } from '@/lib/focusedCodeEditor'
import { registerMarkdownSourceShortcuts } from '@/components/markdownSourceShortcuts'
import { useMarkdownSourceContextMenu } from '@/components/markdownSourceContextMenu'
import {
  useMarkdownSourceDiagnostics,
  type MarkdownSourceDiagnosticHost,
} from '@/components/useMarkdownSourceDiagnostics'

type MarkdownSourceEditorProps = {
  activePath: string | null
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
  onChange: (value: string) => void
  onOpenFileView?: (path: string, view: FileViewKind) => void
  onCursorChange?: (position: EditorCursorPosition | null) => void
  readOnly?: boolean
}

const MarkdownSourceEditor = ({
  activePath,
  value,
  files,
  fileContents,
  workspaceIndex,
  onChange,
  onOpenFileView,
  onCursorChange,
  readOnly = false,
}: MarkdownSourceEditorProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const sourceCodeMiniMapEnabled = usePreferencesStore((state) => state.sourceCodeMiniMapEnabled)
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const shortcutOverrides = usePreferencesStore((state) => state.shortcutOverrides)
  const [monacoReady, setMonacoReady] = useState(false)
  const [monacoLoadError, setMonacoLoadError] = useState<unknown>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const cursorCallbackRef = useLatest(onCursorChange)
  const cursorSubscriptionRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticHostRef = useRef<MarkdownSourceDiagnosticHost | null>(null)
  const providersDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const shortcutsDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const searchHighlightRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const searchHighlightTimerRef = useRef<number | null>(null)
  const { completionContextRef, scheduleDiagnostics } = useMarkdownSourceDiagnostics({
    activePath,
    files,
    fileContents,
    hostRef: diagnosticHostRef,
    workspaceIndex,
  })
  const pendingSourcePositionRef = useRef<FocusSourcePositionRequest | null>(null)
  const contextMenu = useMarkdownSourceContextMenu(editorRef, readOnly)

  useEffect(() => {
    let cancelled = false

    void import('@/lib/monaco')
      .then(({ configureMonaco }) => configureMonaco())
      .then(() => {
        if (!cancelled) {
          setMonacoReady(true)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMonacoLoadError(error)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (pendingSourcePositionRef.current?.path !== activePath) {
      pendingSourcePositionRef.current = null
    }
  }, [activePath])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    cursorSubscriptionRef.current?.dispose()
    cursorSubscriptionRef.current = editor.onDidChangeCursorPosition(({ position }) => {
      cursorCallbackRef.current?.(position)
    })
    cursorCallbackRef.current?.(editor.getPosition())
    setFocusedCodeEditor(editor)
    diagnosticHostRef.current = { editor, monaco: monaco as typeof import('monaco-editor') }

    providersDisposableRef.current?.dispose()
    providersDisposableRef.current = registerMarkdownSourceProviders({
      monaco: monaco as typeof import('monaco-editor'),
      editor,
      getContext: () => completionContextRef.current,
      onOpenFileView,
      scheduleDiagnostics,
    })
    shortcutsDisposableRef.current?.dispose()
    shortcutsDisposableRef.current = readOnly
      ? null
      : registerMarkdownSourceShortcuts({ editor, overrides: shortcutOverrides })

    scheduleDiagnostics()
    const pending = pendingSourcePositionRef.current
    if (pending) focusSourcePosition(pending)
  }

  useEffect(() => {
    if (onCursorChange && editorRef.current) onCursorChange(editorRef.current.getPosition())
  }, [activePath, onCursorChange])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    shortcutsDisposableRef.current?.dispose()
    shortcutsDisposableRef.current = readOnly
      ? null
      : registerMarkdownSourceShortcuts({ editor, overrides: shortcutOverrides })
  }, [readOnly, shortcutOverrides])

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
    ({ path, line, column, endColumn }: FocusSourcePositionRequest) => {
      if (!path || path !== completionContextRef.current.activePath) return
      if (!Number.isFinite(line) || !Number.isFinite(column)) return

      const editor = editorRef.current
      const monaco = diagnosticHostRef.current?.monaco
      if (!editor || !monaco) {
        pendingSourcePositionRef.current = { path, line, column, endColumn }
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
    },
    [completionContextRef],
  )

  useEffect(() => onFocusSourcePositionRequest(focusSourcePosition), [focusSourcePosition])

  const editorLoadError =
    monacoLoadError instanceof Error ? monacoLoadError.message : String(monacoLoadError)

  return (
    <MarkdownSourceEditorSurface
      activePath={activePath}
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

export default MarkdownSourceEditor
