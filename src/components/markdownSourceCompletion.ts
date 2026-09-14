import type {
  CancellationToken,
  IDisposable,
  editor as MonacoEditor,
  IPosition,
  languages as MonacoLanguages,
} from 'monaco-editor'
import { getMarkdownCompletions } from '@/logic/markdownCompletions'
import { isDesktopRuntime } from '@/runtime/environment'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'

export type MarkdownSourceCompletionContext = {
  activePath: string | null
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
}

type MonacoModule = typeof import('monaco-editor')
type CancellationLike = Pick<CancellationToken, 'isCancellationRequested'> &
  Partial<Pick<CancellationToken, 'onCancellationRequested'>>
type MarkdownCompletionItem = ReturnType<typeof getMarkdownCompletions>[number] & {
  sortText?: string
}

export const registerMarkdownCompletionProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  let disposed = false
  let latestRequest = 0
  const registration = monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['[', '(', '#', '/', '`'],
    provideCompletionItems: async (
      model: MonacoEditor.ITextModel,
      position: IPosition,
      _context: MonacoLanguages.CompletionContext,
      token: CancellationLike = { isCancellationRequested: false },
    ) => {
      if (disposed || token.isCancellationRequested || model.isDisposed()) {
        return { suggestions: [] }
      }
      const context = getContext()
      const path = context.activePath
      const version = model.getVersionId()
      const request = ++latestRequest
      const isCurrent = () =>
        !disposed &&
        !token.isCancellationRequested &&
        request === latestRequest &&
        !model.isDisposed() &&
        model.getVersionId() === version &&
        getContext().activePath === path
      let cancellationSubscription: IDisposable | undefined
      const cancelled = new Promise<MarkdownCompletionItem[]>((resolve) => {
        cancellationSubscription = token.onCancellationRequested?.(() => resolve([]))
      })

      try {
        // IPC has no abort command; release Monaco immediately and ignore any late response.
        const completions = await Promise.race([
          getCompletionItems(model, position, context, isCurrent),
          cancelled,
        ])
        if (!isCurrent()) return { suggestions: [] }
        const suggestions: MonacoLanguages.CompletionItem[] = completions.map((item) => ({
          label: item.label,
          kind:
            item.kind === 'file'
              ? monaco.languages.CompletionItemKind.File
              : item.kind === 'heading'
                ? monaco.languages.CompletionItemKind.Reference
                : monaco.languages.CompletionItemKind.Keyword,
          insertText: item.insertText,
          detail: item.detail,
          sortText: item.sortText,
          range: new monaco.Range(
            position.lineNumber,
            item.replacementStartColumn,
            position.lineNumber,
            position.column,
          ),
        }))
        return { suggestions }
      } finally {
        cancellationSubscription?.dispose()
      }
    },
  })
  return {
    dispose: () => {
      if (disposed) return
      disposed = true
      registration.dispose()
    },
  }
}

const getCompletionItems = async (
  model: MonacoEditor.ITextModel,
  position: IPosition,
  context: MarkdownSourceCompletionContext,
  isCurrent: () => boolean,
): Promise<MarkdownCompletionItem[]> => {
  if (!isCurrent()) return []
  const content = model.getValue()
  const request = {
    path: context.activePath,
    content,
    line: position.lineNumber,
    column: position.column,
  }

  if (isDesktopRuntime() && context.activePath) {
    return markdownLanguageApi.getCompletions(request).catch(() =>
      !isCurrent()
        ? []
        : getMarkdownCompletions({
            ...context,
            content,
            line: position.lineNumber,
            column: position.column,
          }),
    )
  }

  return getMarkdownCompletions({
    ...context,
    content,
    line: position.lineNumber,
    column: position.column,
  })
}
