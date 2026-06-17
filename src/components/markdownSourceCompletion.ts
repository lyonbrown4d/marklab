import type { editor as MonacoEditor, IPosition, languages as MonacoLanguages } from 'monaco-editor'
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
type CancellationLike = { isCancellationRequested: boolean }

export const registerMarkdownCompletionProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  return monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['[', '(', '#', '/', '`'],
    provideCompletionItems: async (
      model: MonacoEditor.ITextModel,
      position: IPosition,
      _context: MonacoLanguages.CompletionContext,
      token: CancellationLike = { isCancellationRequested: false },
    ) => {
      if (token.isCancellationRequested) return { suggestions: [] }
      const completions = await getCompletionItems(model, position, getContext(), token)
      if (token.isCancellationRequested) return { suggestions: [] }
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
    },
  })
}

const getCompletionItems = async (
  model: MonacoEditor.ITextModel,
  position: IPosition,
  context: MarkdownSourceCompletionContext,
  token: CancellationLike,
): Promise<Array<ReturnType<typeof getMarkdownCompletions>[number] & { sortText?: string }>> => {
  const content = model.getValue()
  const request = {
    path: context.activePath,
    content,
    line: position.lineNumber,
    column: position.column,
  }

  if (isDesktopRuntime() && context.activePath) {
    return markdownLanguageApi.getCompletions(request).catch(() =>
      token.isCancellationRequested
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
