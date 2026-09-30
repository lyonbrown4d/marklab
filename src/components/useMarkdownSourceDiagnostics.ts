import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useLatest } from 'ahooks'
import { ReplaySubject, catchError, debounceTime, from, map, of, switchMap } from 'rxjs'
import type { OnMount } from '@monaco-editor/react'
import {
  getMarkdownSourceDiagnostics,
  MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER,
} from '@/logic/markdownDiagnostics'
import { markdownEditorPerformancePolicy } from '@/components/markdownEditorPerformance'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { FsMarkdownDiagnostic, FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'
import { isDesktopRuntime } from '@/runtime/environment'

export type MarkdownSourceDiagnosticHost = {
  editor: Parameters<OnMount>[0]
  monaco: typeof import('monaco-editor')
}

type Diagnostics = Array<
  FsMarkdownDiagnostic | ReturnType<typeof getMarkdownSourceDiagnostics>[number]
>

type DiagnosticsContext = {
  activePath: string | null
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
}

type UseMarkdownSourceDiagnosticsOptions = DiagnosticsContext & {
  hostRef: RefObject<MarkdownSourceDiagnosticHost | null>
}

export const useMarkdownSourceDiagnostics = ({
  activePath,
  files,
  fileContents,
  hostRef,
  workspaceIndex,
}: UseMarkdownSourceDiagnosticsOptions) => {
  const contextRef = useLatest({ activePath, files, fileContents, workspaceIndex })
  const requestsRef = useRef(new ReplaySubject<{ content: string; context: DiagnosticsContext }>(1))

  const applyDiagnostics = useCallback(
    (diagnostics: Diagnostics) => {
      const host = hostRef.current
      const model = host?.editor.getModel()
      if (!host || !model) return
      const markers = diagnostics.map((diagnostic) => {
        const startColumn =
          'start_column' in diagnostic ? diagnostic.start_column : diagnostic.startColumn
        const endColumn = 'end_column' in diagnostic ? diagnostic.end_column : diagnostic.endColumn
        return {
          code: diagnostic.severity === 'error' ? 'M001' : 'M002',
          endColumn: Math.max(startColumn + 1, endColumn),
          endLineNumber: diagnostic.line,
          message: diagnostic.message,
          severity:
            diagnostic.severity === 'error'
              ? host.monaco.MarkerSeverity.Error
              : host.monaco.MarkerSeverity.Warning,
          source: 'markdown',
          startColumn,
          startLineNumber: diagnostic.line,
        }
      })
      host.monaco.editor.setModelMarkers(model, MARKDOWN_SOURCE_LINK_DIAGNOSTIC_OWNER, markers)
    },
    [hostRef],
  )

  useEffect(() => {
    const subscription = requestsRef.current
      .pipe(
        debounceTime(120),
        switchMap(({ content, context }) => {
          if (markdownEditorPerformancePolicy(content.length).diagnostics === 'disabled')
            return of<Diagnostics>([])
          if (isDesktopRuntime() && context.activePath) {
            return from(
              markdownLanguageApi.getDiagnostics({ path: context.activePath, content }),
            ).pipe(
              map((diagnostics) => diagnostics as Diagnostics),
              catchError(() => of(getMarkdownSourceDiagnostics({ ...context, content }))),
            )
          }
          return of(getMarkdownSourceDiagnostics({ ...context, content }))
        }),
      )
      .subscribe(applyDiagnostics)
    return () => subscription.unsubscribe()
  }, [applyDiagnostics])

  const scheduleDiagnostics = useCallback(() => {
    const model = hostRef.current?.editor.getModel()
    if (!model) return
    requestsRef.current.next({ content: model.getValue(), context: contextRef.current })
  }, [contextRef, hostRef])

  useEffect(scheduleDiagnostics, [
    activePath,
    files,
    fileContents,
    scheduleDiagnostics,
    workspaceIndex,
  ])
  return { completionContextRef: contextRef, scheduleDiagnostics }
}
