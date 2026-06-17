import type { editor as MonacoEditor } from 'monaco-editor'
import { isDesktopRuntime } from '@/runtime/environment'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'

type MonacoModule = typeof import('monaco-editor')

export const registerMarkdownReferenceProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  return monaco.languages.registerReferenceProvider('markdown', {
    provideReferences: async (model: MonacoEditor.ITextModel, position) => {
      const context = getContext()
      if (!context.activePath || !isDesktopRuntime()) return []

      const references = await markdownLanguageApi
        .getReferences({
          path: context.activePath,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
        })
        .catch(() => [])

      return references.map((reference) => ({
        uri:
          reference.path === context.activePath
            ? model.uri
            : monaco.Uri.parse(`marklab-reference:///${encodeURIComponent(reference.path)}`),
        range: new monaco.Range(
          reference.line,
          reference.column,
          reference.line,
          reference.endColumn,
        ),
      }))
    },
  })
}
