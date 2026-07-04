import { useCallback, useEffect, useRef, useState } from 'react'
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
import { onFocusSourcePositionRequest } from '@/utils/editorNavigation'
import { isDesktopRuntime } from '@/runtime/environment'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { registerMarkdownSourceProviders } from '@/components/markdownSourceProviders'
import { MarkdownSourceEditorSurface } from '@/components/MarkdownSourceEditorSurface'
import { useI18n } from '@/i18n/useI18n'

type MarkdownSourceEditorProps = {
  activePath: string | null
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
  onChange: (value: string) => void
  onOpenFileView?: (path: string, view: FileViewKind) => void
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
}: MarkdownSourceEditorProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const [monacoReady, setMonacoReady] = useState(false)
  const [monacoLoadError, setMonacoLoadError] = useState<unknown>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const diagnosticHostRef = useRef<{
    editor: Parameters<OnMount>[0]
    monaco: typeof import('monaco-editor')
  } | null>(null)
  const providersDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticsRequestStreamRef = useRef(new ReplaySubject<MarkdownSourceDiagnosticsRequest>(1))
  const searchHighlightRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const searchHighlightTimerRef = useRef<number | null>(null)
  const completionContextRef = useRef({ activePath, files, fileContents, workspaceIndex })

  useEffect(() => {
    completionContextRef.current = { activePath, files, fileContents, workspaceIndex }
  }, [activePath, fileContents, files, workspaceIndex])

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

  const applyDiagnostics = useCallback(
    (
      diagnostics: Array<
        FsMarkdownDiagnostic | ReturnType<typeof getMarkdownSourceDiagnostics>[number]
      >,
    ) => {
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
    },
    [],
  )

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
  }, [])

  useEffect(() => {
    scheduleDiagnostics()
  }, [activePath, files, fileContents, scheduleDiagnostics, workspaceIndex])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
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
  }

  useEffect(() => {
    return () => {
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
      diagnosticHostRef.current = null
    }
  }, [])

  useEffect(() => {
    return onFocusSourcePositionRequest(({ path, line, column, endColumn }) => {
      if (!path || path !== activePath) return
      if (!Number.isFinite(line) || !Number.isFinite(column)) return

      const editor = editorRef.current
      const monaco = diagnosticHostRef.current?.monaco
      if (!editor || !monaco) return

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
    })
  }, [activePath])

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
      value={value}
      onChange={onChange}
      onMount={handleMount}
    />
  )
}

export default MarkdownSourceEditor
