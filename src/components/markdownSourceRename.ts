import type { editor as MonacoEditor } from 'monaco-editor'
import { isDesktopRuntime } from '@/runtime/environment'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'

type MonacoModule = typeof import('monaco-editor')

export const registerMarkdownRenameProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  return monaco.languages.registerRenameProvider('markdown', {
    provideRenameEdits: async (model: MonacoEditor.ITextModel, position, newName) => {
      const context = getContext()
      if (!context.activePath || !isDesktopRuntime()) {
        return { edits: [], rejectReason: 'Rename is only available in desktop workspaces.' }
      }

      const result = await markdownLanguageApi
        .renameReferences({
          path: context.activePath,
          content: model.getValue(),
          line: position.lineNumber,
          column: position.column,
          newName,
        })
        .catch(() => null)

      if (!result) return { edits: [], rejectReason: 'Failed to rename references.' }
      if (result.rejectReason) return { edits: [], rejectReason: result.rejectReason }

      return {
        edits: result.edits
          .filter((edit) => edit.path === context.activePath)
          .map((edit) => ({
            resource: model.uri,
            versionId: model.getVersionId(),
            textEdit: {
              range: new monaco.Range(edit.line, edit.startColumn, edit.line, edit.endColumn),
              text: edit.newText,
            },
          })),
      }
    },
  })
}
