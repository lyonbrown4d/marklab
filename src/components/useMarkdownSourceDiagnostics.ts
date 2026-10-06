import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { ReplaySubject, debounceTime, of, switchMap } from 'rxjs'
import type { OnMount } from '@monaco-editor/react'
import {
  getMarkdownSourceDiagnostics,
  MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER,
} from '@/logic/markdownDiagnostics'
import { markdownEditorPerformancePolicy } from '@/components/markdownEditorPerformance'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'
import { isDesktopRuntime } from '@/runtime/environment'

export type MarkdownSourceDiagnosticHost = {
  editor: Parameters<OnMount>[0]
  monaco: typeof import('monaco-editor')
}

type Diagnostics = ReturnType<typeof getMarkdownSourceDiagnostics>

type DiagnosticsContext = {
  activePath: string | null
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
}

type UseMarkdownSourceDiagnosticsOptions = DiagnosticsContext & {
  enabled?: boolean
  hostRef: RefObject<MarkdownSourceDiagnosticHost | null>
}

export const useMarkdownSourceDiagnostics = ({
  activePath,
  enabled = true,
  files,
  fileContents,
  hostRef,
  workspaceIndex,
}: UseMarkdownSourceDiagnosticsOptions) => {
  const desktopRuntime = isDesktopRuntime()
  const contextRef = useLatest({ activePath, files, fileContents, workspaceIndex })
  const requestsRef = useRef(new ReplaySubject<{ content: string; context: DiagnosticsContext }>(1))

  const applyDiagnostics = useCallback(
    (diagnostics: Diagnostics) => {
      const host = hostRef.current
      const model = host?.editor.getModel()
      if (!host || !model) return
      const markers = diagnostics.map((diagnostic) => {
        return {
          code: diagnostic.severity === 'error' ? 'M001' : 'M002',
          endColumn: Math.max(diagnostic.startColumn + 1, diagnostic.endColumn),
          endLineNumber: diagnostic.line,
          message: diagnostic.message,
          severity:
            diagnostic.severity === 'error'
              ? host.monaco.MarkerSeverity.Error
              : host.monaco.MarkerSeverity.Warning,
          source: 'markdown',
          startColumn: diagnostic.startColumn,
          startLineNumber: diagnostic.line,
        }
      })
      host.monaco.editor.setModelMarkers(model, MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER, markers)
    },
    [hostRef],
  )

  useEffect(() => {
    if (!enabled) {
      applyDiagnostics([])
      return
    }
    if (desktopRuntime) {
      applyDiagnostics([])
      return
    }
    const subscription = requestsRef.current
      .pipe(
        debounceTime(120),
        switchMap(({ content, context }) => {
          if (markdownEditorPerformancePolicy(content.length).diagnostics === 'disabled')
            return of<Diagnostics>([])
          return of(getMarkdownSourceDiagnostics({ ...context, content }))
        }),
      )
      .subscribe(applyDiagnostics)
    return () => subscription.unsubscribe()
  }, [applyDiagnostics, desktopRuntime, enabled])

  const scheduleDiagnostics = useCallback(() => {
    if (!enabled) {
      applyDiagnostics([])
      return
    }
    if (desktopRuntime) {
      applyDiagnostics([])
      return
    }
    const model = hostRef.current?.editor.getModel()
    if (!model) return
    requestsRef.current.next({ content: model.getValue(), context: contextRef.current })
  }, [applyDiagnostics, contextRef, desktopRuntime, enabled, hostRef])

  useEffect(scheduleDiagnostics, [
    activePath,
    files,
    fileContents,
    scheduleDiagnostics,
    workspaceIndex,
  ])
  return { completionContextRef: contextRef, scheduleDiagnostics }
}
