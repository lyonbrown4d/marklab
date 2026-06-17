import type { editor as MonacoEditor } from 'monaco-editor'
import { isDesktopRuntime } from '@/runtime/environment'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'

type MonacoModule = typeof import('monaco-editor')

export const registerMarkdownHoverProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  return monaco.languages.registerHoverProvider('markdown', {
    provideHover: async (model: MonacoEditor.ITextModel, position) => {
      const context = getContext()
      if (!context.activePath || !isDesktopRuntime()) return null

      const hover = await markdownLanguageApi
        .getHover({
          path: context.activePath,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
        })
        .catch(() => null)

      if (!hover) return null
      return {
        contents: [{ value: hover.markdown }],
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column,
        ),
      }
    },
  })
}
