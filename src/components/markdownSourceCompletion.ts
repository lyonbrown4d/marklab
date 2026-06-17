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

export const registerMarkdownCompletionProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  return monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['[', '(', '#', '/', '`'],
    provideCompletionItems: async (model: MonacoEditor.ITextModel, position: IPosition) => {
      const completions = await getCompletionItems(model, position, getContext())
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
) => {
  const content = model.getValue()
  const request = {
    path: context.activePath,
    content,
    line: position.lineNumber,
    column: position.column,
  }

  if (isDesktopRuntime() && context.activePath) {
    return markdownLanguageApi.getCompletions(request).catch(() =>
      getMarkdownCompletions({
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
