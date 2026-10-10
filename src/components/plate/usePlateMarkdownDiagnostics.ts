import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { NodeEntry } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { DiagnosticSeverity, type Diagnostic } from 'vscode-languageserver-types'
import { markdownEditorPerformancePolicy } from '@/components/markdownEditorPerformance'
import {
  applyPlateDiagnosticAction,
  createPlateDiagnosticRanges,
  diagnosticRangesForEntry,
  focusPlateDiagnostic,
} from '@/components/plate/plateDiagnosticRanges'
import {
  clearPlateDiagnostics,
  publishPlateDiagnostics,
} from '@/components/plate/plateDiagnosticsStore'
import { createPlateMarkdownDiagnosticsSession } from '@/components/plate/plateMarkdownDiagnosticsSession'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'

const DIAGNOSTIC_DELAY_MS = 120
let sessionSequence = 0

type DiagnosticSnapshot = {
  content: string
  diagnostics: MarkdownSourceDiagnostic[]
  path: string | null
}

type UsePlateMarkdownDiagnosticsOptions = {
  activePath: string | null
  editor: PlateEditor
  enabled: boolean
  getMarkdown: () => Promise<string>
  readOnly: boolean
  value: string
  workspaceKey?: string
}

const diagnosticMessage = (diagnostic: Diagnostic) =>
  typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value

export const toMarkdownSourceDiagnostic = (diagnostic: Diagnostic): MarkdownSourceDiagnostic => {
  const code =
    typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number'
      ? String(diagnostic.code)
      : undefined
  const message = diagnosticMessage(diagnostic)
  const line = diagnostic.range.start.line + 1
  const startColumn = diagnostic.range.start.character + 1
  const endColumn = Math.max(startColumn + 1, diagnostic.range.end.character + 1)
  return {
    code,
    endColumn,
    id: [diagnostic.source, code, line, startColumn, endColumn, message].join(':'),
    line,
    message,
    severity: diagnostic.severity === DiagnosticSeverity.Error ? 'error' : 'warning',
    source: diagnostic.source,
    startColumn,
  }
}

export const usePlateMarkdownDiagnostics = ({
  activePath,
  editor,
  enabled,
  getMarkdown,
  readOnly,
  value,
  workspaceKey = '',
}: UsePlateMarkdownDiagnosticsOptions) => {
  const desktopRuntime = isDesktopRuntime()
  const [controllerKey] = useState(() => `plate-diagnostics:${++sessionSequence}`)
  const sessionRef = useRef<ReturnType<typeof createPlateMarkdownDiagnosticsSession> | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0)
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot>({
    content: value,
    diagnostics: [],
    path: null,
  })

  useEffect(() => {
    if (!enabled || !desktopRuntime || !activePath) {
      sessionRef.current = null
      return
    }
    const uri = `marklab-rich-editor://diagnostics/${encodeURIComponent(controllerKey)}`
    const session = createPlateMarkdownDiagnosticsSession({
      api: languageIntelligenceApi,
      onDiagnostics: (content, diagnostics) => {
        setSnapshot({
          content,
          diagnostics: diagnostics.map(toMarkdownSourceDiagnostic),
          path: activePath,
        })
      },
      onError: (error) => {
        setSnapshot({ content: '', diagnostics: [], path: null })
        console.error('Rich editor diagnostics failed', error)
      },
      path: activePath,
      uri,
    })
    sessionRef.current = session
    return () => {
      sessionRef.current = null
      void session.close().catch(() => undefined)
    }
  }, [activePath, controllerKey, desktopRuntime, enabled])

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const request = ++requestRef.current
    if (!enabled || !desktopRuntime || !activePath) return
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void getMarkdown()
        .then((content) => {
          if (request !== requestRef.current) return
          if (markdownEditorPerformancePolicy(content.length).diagnostics === 'disabled') {
            setSnapshot({ content, diagnostics: [], path: null })
            return
          }
          return sessionRef.current?.analyze(content)
        })
        .catch((error) => console.error('Rich editor diagnostics snapshot failed', error))
    }, DIAGNOSTIC_DELAY_MS)
  }, [activePath, desktopRuntime, enabled, getMarkdown])

  useEffect(() => {
    schedule()
    return () => {
      requestRef.current += 1
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [schedule, value])

  const currentSnapshot = useMemo<DiagnosticSnapshot | null>(
    () =>
      enabled && desktopRuntime && activePath && snapshot.path === activePath ? snapshot : null,
    [activePath, desktopRuntime, enabled, snapshot],
  )
  const ranges = useMemo(
    () =>
      createPlateDiagnosticRanges(
        editor,
        currentSnapshot?.content ?? value,
        currentSnapshot?.diagnostics ?? [],
      ),
    [currentSnapshot, editor, value],
  )
  useEffect(() => editor.api.redecorate(), [editor, ranges])

  const decorate = useCallback(
    ({ entry }: { entry: NodeEntry }) => diagnosticRangesForEntry(ranges, entry),
    [ranges],
  )

  useEffect(() => {
    if (!enabled || !desktopRuntime || !activePath || !currentSnapshot) {
      clearPlateDiagnostics(controllerKey)
      return
    }
    publishPlateDiagnostics({
      key: controllerKey,
      workspaceKey,
      path: activePath,
      content: currentSnapshot.content,
      diagnostics: currentSnapshot.diagnostics,
      focus: (problem) => focusPlateDiagnostic(editor, currentSnapshot.content, problem),
      getActions: (problem) =>
        readOnly
          ? Promise.resolve([])
          : markdownLanguageApi.getCodeActions({
              path: activePath,
              content: currentSnapshot.content,
              line: problem.line,
              column: problem.startColumn,
            }),
      applyAction: async (problem, action) => {
        if (readOnly) return false
        if (action.kind === 'create-file') {
          await fsApi.createFile(action.path, action.content)
          schedule()
          return true
        }
        if (action.edit.path !== activePath) return false
        const current = await getMarkdown()
        if (current !== currentSnapshot.content) return false
        return applyPlateDiagnosticAction(editor, current, problem, action)
      },
    })
    return () => clearPlateDiagnostics(controllerKey)
  }, [
    activePath,
    controllerKey,
    desktopRuntime,
    editor,
    enabled,
    getMarkdown,
    readOnly,
    schedule,
    currentSnapshot,
    workspaceKey,
  ])

  return { decorate, schedule }
}
