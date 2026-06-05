import { useCallback, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor, IPosition, languages as MonacoLanguages } from 'monaco-editor'
import { useDarkMode } from '@/hooks/useDarkMode'
import { getMarkdownCompletions } from '@/logic/markdownCompletions'
import {
  getMarkdownSourceDiagnostics,
  MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER,
} from '@/logic/markdownDiagnostics'
import type { FileEntry } from '@/store/useAppStore'
import { fsApi, type FsMarkdownDiagnostic, type FsWorkspaceIndex } from '@/services/fsApi'
import { onFocusSourcePositionRequest } from '@/utils/editorNavigation'
import { isDesktopRuntime } from '@/runtime/environment'
import { useAppStore } from '@/store/useAppStore'

type MarkdownSourceEditorProps = {
  activePath: string | null
  value: string
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
  onChange: (value: string) => void
}

const MarkdownSourceEditor = ({
  activePath,
  value,
  files,
  fileContents,
  workspaceIndex,
  onChange,
}: MarkdownSourceEditorProps) => {
  const darkMode = useDarkMode()
  const motionSmoothScrolling = useAppStore((state) => state.motionSmoothScrolling)
  const motionAnimatedCursor = useAppStore((state) => state.motionAnimatedCursor)
  const immersiveZenMode = useAppStore((state) => state.immersiveZenMode)
  const immersiveFocusMode = useAppStore((state) => state.immersiveFocusMode)
  const immersiveTypewriterMode = useAppStore((state) => state.immersiveTypewriterMode)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const diagnosticHostRef = useRef<{
    editor: Parameters<OnMount>[0]
    monaco: typeof import('monaco-editor')
  } | null>(null)
  const completionDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticsDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const diagnosticsTimerRef = useRef<number | null>(null)
  const diagnosticsRequestRef = useRef(0)
  const searchHighlightRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const searchHighlightTimerRef = useRef<number | null>(null)
  const completionContextRef = useRef({ activePath, files, fileContents, workspaceIndex })
  const diagnosticsContextRef = useRef({ activePath, files, fileContents, workspaceIndex })

  useEffect(() => {
    completionContextRef.current = { activePath, files, fileContents, workspaceIndex }
    diagnosticsContextRef.current = { activePath, files, fileContents, workspaceIndex }
  }, [activePath, fileContents, files, workspaceIndex])

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

  const refreshDiagnostics = useCallback(() => {
    const host = diagnosticHostRef.current
    const editor = host?.editor
    const model = editor?.getModel()
    if (!host || !model) return

    const content = model.getValue()
    const context = diagnosticsContextRef.current
    const requestId = diagnosticsRequestRef.current + 1
    diagnosticsRequestRef.current = requestId

    if (isDesktopRuntime() && context.activePath) {
      void fsApi
        .analyzeMarkdownBuffer(context.activePath, content)
        .then((diagnostics) => {
          if (diagnosticsRequestRef.current !== requestId) return
          applyDiagnostics(diagnostics)
        })
        .catch(() => {
          if (diagnosticsRequestRef.current !== requestId) return
          applyDiagnostics(getMarkdownSourceDiagnostics({ ...context, content }))
        })
      return
    }

    applyDiagnostics(getMarkdownSourceDiagnostics({ ...context, content }))
  }, [applyDiagnostics])

  const scheduleDiagnostics = useCallback(() => {
    if (diagnosticsTimerRef.current !== null) {
      window.clearTimeout(diagnosticsTimerRef.current)
    }
    diagnosticsTimerRef.current = window.setTimeout(() => {
      diagnosticsTimerRef.current = null
      refreshDiagnostics()
    }, 120)
  }, [refreshDiagnostics])

  useEffect(() => {
    scheduleDiagnostics()
  }, [activePath, files, fileContents, scheduleDiagnostics, workspaceIndex])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    diagnosticHostRef.current = { editor, monaco: monaco as typeof import('monaco-editor') }

    completionDisposableRef.current?.dispose()
    completionDisposableRef.current = monaco.languages.registerCompletionItemProvider('markdown', {
      triggerCharacters: ['[', '(', '#', '/', '`'],
      provideCompletionItems: (model: MonacoEditor.ITextModel, position: IPosition) => {
        const context = completionContextRef.current
        const suggestions: MonacoLanguages.CompletionItem[] = getMarkdownCompletions({
          ...context,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
        }).map((item) => ({
          label: item.label,
          kind:
            item.kind === 'file'
              ? monaco.languages.CompletionItemKind.File
              : item.kind === 'heading'
                ? monaco.languages.CompletionItemKind.Reference
                : monaco.languages.CompletionItemKind.Keyword,
          insertText: item.insertText,
          detail: item.detail,
          range: new monaco.Range(
            position.lineNumber,
            item.replacementStartColumn,
            position.lineNumber,
            position.column,
          ),
        }))
        return { suggestions }
      },
    })
    diagnosticsDisposableRef.current?.dispose()
    diagnosticsDisposableRef.current = editor.onDidChangeModelContent(() => scheduleDiagnostics())

    refreshDiagnostics()
  }

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose()
      completionDisposableRef.current = null
      diagnosticsDisposableRef.current?.dispose()
      diagnosticsDisposableRef.current = null
      if (diagnosticsTimerRef.current !== null) {
        window.clearTimeout(diagnosticsTimerRef.current)
        diagnosticsTimerRef.current = null
      }
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
            className: 'marko-search-hit-line',
            inlineClassName: 'marko-search-hit-inline',
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

  return (
    <div
      className={[
        'markdown-source-editor h-full overflow-hidden',
        immersiveZenMode ? 'is-zen-editor' : '',
        immersiveFocusMode ? 'is-focus-editor' : '',
        immersiveTypewriterMode ? 'is-typewriter-editor' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Editor
        height="100%"
        language="markdown"
        theme={darkMode ? 'vs-dark' : 'vs'}
        path={activePath ?? 'marklab-empty.md'}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          wordWrap: 'on',
          tabSize: 2,
          scrollBeyondLastLine: false,
          fontSize: 14,
          lineNumbers: 'on',
          renderLineHighlight: immersiveFocusMode ? 'all' : 'line',
          smoothScrolling: motionSmoothScrolling,
          cursorBlinking: motionAnimatedCursor ? 'smooth' : 'blink',
          cursorSmoothCaretAnimation: motionAnimatedCursor ? 'on' : 'off',
          cursorSurroundingLines: immersiveTypewriterMode ? 8 : 3,
          cursorSurroundingLinesStyle: 'all',
          cursorWidth: 2,
          renderWhitespace: 'selection',
          automaticLayout: true,
          lineNumbersMinChars: 3,
          padding: {
            top: immersiveTypewriterMode ? 120 : 24,
            bottom: immersiveTypewriterMode ? 180 : 24,
          },
        }}
      />
    </div>
  )
}

export default MarkdownSourceEditor
