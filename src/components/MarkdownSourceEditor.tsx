import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import type { EditorCursorPosition } from '@/components/EditorDocumentStatus'
import { ReplaySubject, catchError, debounceTime, from, map, of, switchMap } from 'rxjs'
import type { OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useDarkMode } from '@/hooks/useDarkMode'
import {
  getMarkdownSourceDiagnostics,
  MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER,
} from '@/logic/markdownDiagnostics'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import type { FsMarkdownDiagnostic, FsWorkspaceIndex } from '@/services/fsApi'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import {
  onFocusSourcePositionRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'
import { isDesktopRuntime } from '@/runtime/environment'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { registerMarkdownSourceProviders } from '@/components/markdownSourceProviders'
import { MarkdownSourceEditorSurface } from '@/components/MarkdownSourceEditorSurface'
import { useI18n } from '@/i18n/useI18n'
import { clearFocusedCodeEditor, setFocusedCodeEditor } from '@/lib/focusedCodeEditor'

type MarkdownSourceEditorProps = {
  activePath: string | null
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
  onChange: (value: string) => void
  onOpenFileView?: (path: string, view: FileViewKind) => void
  onCursorChange?: (position: EditorCursorPosition | null) => void
}

const SOURCE_DIAGNOSTICS_MAX_CHARS = 500_000
const SOURCE_DIAGNOSTICS_DEBOUNCE_MS = 120

type MarkdownSourceDiagnostics = Array<
  FsMarkdownDiagnostic | ReturnType<typeof getMarkdownSourceDiagnostics>[number]
>

type MarkdownSourceDiagnosticsRequest = {
  content: string
  context: {
    activePath: string | null
    files: FileEntry[]
    fileContents: Record<string, string>
    workspaceIndex?: FsWorkspaceIndex | null
  }
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
}: MarkdownSourceEditorProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const sourceCodeMiniMapEnabled = usePreferencesStore((state) => state.sourceCodeMiniMapEnabled)
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const [monacoReady, setMonacoReady] = useState(false)
  const [monacoLoadError, setMonacoLoadError] = useState<unknown>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const cursorCallbackRef = useLatest(onCursorChange)
  const cursorSubscriptionRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticHostRef = useRef<{
    editor: Parameters<OnMount>[0]
    monaco: typeof import('monaco-editor')
  } | null>(null)
  const providersDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticsRequestStreamRef = useRef(new ReplaySubject<MarkdownSourceDiagnosticsRequest>(1))
  const searchHighlightRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const searchHighlightTimerRef = useRef<number | null>(null)
  const completionContextRef = useLatest({ activePath, files, fileContents, workspaceIndex })
  const pendingSourcePositionRef = useRef<FocusSourcePositionRequest | null>(null)

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

  const applyDiagnostics = useCallback((diagnostics: MarkdownSourceDiagnostics) => {
    const host = diagnosticHostRef.current
    const editor = host?.editor
    const monaco = host?.monaco
    const model = editor?.getModel()
    if (!host || !model || !monaco) return

    const markers = diagnostics.map((diagnostic) => {
      const startColumn =
        'start_column' in diagnostic ? diagnostic.start_column : diagnostic.startColumn
      const endColumn = 'end_column' in diagnostic ? diagnostic.end_column : diagnostic.endColumn
      return {
        severity:
          diagnostic.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : monaco.MarkerSeverity.Warning,
        message: diagnostic.message,
        startLineNumber: diagnostic.line,
        startColumn,
        endLineNumber: diagnostic.line,
        endColumn: Math.max(startColumn + 1, endColumn),
        source: 'markdown',
        code: diagnostic.severity === 'error' ? 'M001' : 'M002',
      }
    })
    monaco.editor.setModelMarkers(model, MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER, markers)
  }, [])

  useEffect(() => {
    const subscription = diagnosticsRequestStreamRef.current
      .pipe(
        debounceTime(SOURCE_DIAGNOSTICS_DEBOUNCE_MS),
        switchMap(({ content, context }) => {
          if (content.length > SOURCE_DIAGNOSTICS_MAX_CHARS)
            return of<MarkdownSourceDiagnostics>([])

          if (isDesktopRuntime() && context.activePath) {
            return from(
              markdownLanguageApi.getDiagnostics({ path: context.activePath, content }),
            ).pipe(
              map((diagnostics) => diagnostics as MarkdownSourceDiagnostics),
              catchError(() => of(getMarkdownSourceDiagnostics({ ...context, content }))),
            )
          }

          return of(getMarkdownSourceDiagnostics({ ...context, content }))
        }),
      )
      .subscribe((diagnostics) => {
        applyDiagnostics(diagnostics)
      })

    return () => subscription.unsubscribe()
  }, [applyDiagnostics])

  const scheduleDiagnostics = useCallback(() => {
    const host = diagnosticHostRef.current
    const editor = host?.editor
    const model = editor?.getModel()
    if (!host || !model) return

    diagnosticsRequestStreamRef.current.next({
      content: model.getValue(),
      context: completionContextRef.current,
    })
  }, [completionContextRef])

  useEffect(() => {
    if (pendingSourcePositionRef.current?.path !== activePath) {
      pendingSourcePositionRef.current = null
    }
    scheduleDiagnostics()
  }, [activePath, files, fileContents, scheduleDiagnostics, workspaceIndex])

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

    scheduleDiagnostics()
    const pending = pendingSourcePositionRef.current
    if (pending) focusSourcePosition(pending)
  }

  useEffect(() => {
    if (onCursorChange && editorRef.current) onCursorChange(editorRef.current.getPosition())
  }, [activePath, onCursorChange])

  useEffect(() => {
    return () => {
      cursorSubscriptionRef.current?.dispose()
      providersDisposableRef.current?.dispose()
      providersDisposableRef.current = null
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
      sourceCodeMiniMapEnabled={sourceCodeMiniMapEnabled}
      value={value}
      onChange={onChange}
      onMount={handleMount}
    />
  )
}

export default MarkdownSourceEditor
