import { monacoSuggestionOptions } from '@/components/source-code/monacoSuggestionOptions'
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type { editor, IDisposable } from 'monaco-editor'
import { configureMonaco } from '@/lib/monaco'
import { clearFocusedCodeEditor, setFocusedCodeEditor } from '@/lib/focusedCodeEditor'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'
import { conflictEditorLanguage } from '@/features/git/conflicts/conflictEditorLanguage'

export type ConflictEditorHandle = {
  replace: (start: number, end: number, text: string) => void
  replaceAll: (text: string) => void
  reveal: (line: number) => void
}
type Props = {
  rootPath: string
  path: string
  original: string
  content: string
  pending: boolean
  editorRef: RefObject<ConflictEditorHandle | null>
  onChange: (value: string) => void
  onReady: () => void
}

export const ConflictResultEditor = ({
  rootPath,
  path,
  original,
  content,
  pending,
  editorRef,
  onChange,
  onReady,
}: Props) => {
  const { t } = useI18n()
  const dark = useDarkMode()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const comparison = useRef<editor.IStandaloneCodeEditor | null>(null)
  const modified = useRef<editor.IStandaloneCodeEditor | null>(null)
  const subscriptions = useRef<IDisposable[]>([])
  const changed = useRef(onChange)
  useEffect(() => {
    changed.current = onChange
  }, [onChange])
  useEffect(() => {
    let cancelled = false
    void configureMonaco()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure)
      })
    return () => {
      cancelled = true
      subscriptions.current.forEach((item) => item.dispose())
      if (comparison.current) clearFocusedCodeEditor(comparison.current)
      if (modified.current) clearFocusedCodeEditor(modified.current)
      comparison.current = null
      modified.current = null
    }
  }, [])
  const replace = (start: number, end: number, text: string) => {
    const target = modified.current
    const model = target?.getModel()
    if (!target || !model || pending) return
    const from = model.getPositionAt(start)
    const to = model.getPositionAt(end)
    target.pushUndoStop()
    target.executeEdits('git-conflict-resolution', [
      {
        range: {
          startLineNumber: from.lineNumber,
          startColumn: from.column,
          endLineNumber: to.lineNumber,
          endColumn: to.column,
        },
        text,
        forceMoveMarkers: true,
      },
    ])
    target.pushUndoStop()
    target.focus()
  }
  useImperativeHandle(editorRef, () => ({
    replace,
    replaceAll: (text) => replace(0, modified.current?.getModel()?.getValueLength() ?? 0, text),
    reveal: (line) => {
      modified.current?.revealLineInCenter(line)
      modified.current?.focus()
    },
  }))
  if (error)
    return (
      <p role="alert" className="p-3 text-xs text-destructive">
        {t('scm.diffEditorLoadFailed', {
          error: error instanceof Error ? error.message : String(error),
        })}
      </p>
    )
  if (!ready)
    return (
      <p role="status" className="p-3 text-xs text-muted-foreground">
        {t('editor.loadingDocument')}
      </p>
    )
  return (
    <DiffEditor
      height="100%"
      language={conflictEditorLanguage(path)}
      theme={dark ? 'vs-dark' : 'vs'}
      original={original}
      modified={content}
      originalModelPath={`git-conflict://${encodeURIComponent(rootPath)}/comparison/${encodeURIComponent(path)}`}
      modifiedModelPath={`git-conflict://${encodeURIComponent(rootPath)}/result/${encodeURIComponent(path)}`}
      keepCurrentOriginalModel={false}
      keepCurrentModifiedModel={false}
      loading={
        <p role="status" className="p-3 text-xs text-muted-foreground">
          {t('editor.loadingDocument')}
        </p>
      }
      onMount={(diff) => {
        subscriptions.current.forEach((item) => item.dispose())
        if (comparison.current) clearFocusedCodeEditor(comparison.current)
        if (modified.current) clearFocusedCodeEditor(modified.current)
        const source = diff.getOriginalEditor()
        const target = diff.getModifiedEditor()
        comparison.current = source
        modified.current = target
        setFocusedCodeEditor(target)
        subscriptions.current = [
          target.onDidChangeModelContent(() => {
            changed.current(target.getValue())
          }),
          target.onDidFocusEditorText(() => setFocusedCodeEditor(target)),
          source.onDidFocusEditorText(() => setFocusedCodeEditor(source)),
        ]
        onReady()
      }}
      options={{
        ...monacoSuggestionOptions,
        readOnly: pending,
        originalEditable: false,
        renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: true,
        renderSideBySideInlineBreakpoint: 700,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: 'on',
        automaticLayout: true,
        renderWhitespace: 'selection',
        accessibilitySupport: 'on',
        ariaLabel: t('scm.merge.result'),
        originalAriaLabel: t('scm.merge.comparison'),
        modifiedAriaLabel: t('scm.merge.result'),
      }}
    />
  )
}
