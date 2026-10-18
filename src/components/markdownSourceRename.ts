import type { editor as MonacoEditor } from 'monaco-editor'
import { isDesktopRuntime } from '@/runtime/environment'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'

type MonacoModule = typeof import('monaco-editor')

export const registerMarkdownRenameProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  return monaco.languages.registerRenameProvider('markdown', {
    provideRenameEdits: async (model: MonacoEditor.ITextModel, position, newName, token) => {
      const context = getContext()
      if (!context.activePath || !isDesktopRuntime()) {
        return { edits: [], rejectReason: 'Rename is only available in desktop workspaces.' }
      }

      const path = context.activePath
      const version = model.getVersionId()
      const content = model.getValue()
      const isCurrent = () =>
        !token.isCancellationRequested &&
        !model.isDisposed() &&
        model.getVersionId() === version &&
        getContext().activePath === path
      const stale = () => ({
        edits: [],
        rejectReason: token.isCancellationRequested
          ? 'Rename was cancelled.'
          : 'The source document changed. Retry renaming references.',
      })

      if (!isCurrent()) return stale()
      try {
        await flushEditorChanges()
      } catch {
        return { edits: [], rejectReason: 'Save pending changes before renaming references.' }
      }
      if (!isCurrent()) return stale()

      const result = await markdownLanguageApi
        .renameReferences({
          path,
          content,
          line: position.lineNumber,
          column: position.column,
          newName,
        })
        .catch(() => null)

      if (!isCurrent()) return stale()
      if (!result) return { edits: [], rejectReason: 'Failed to rename references.' }
      if (result.rejectReason) return { edits: [], rejectReason: result.rejectReason }

      return {
        edits: result.edits
          .filter((edit) => edit.path === path)
          .map((edit) => ({
            resource: model.uri,
            versionId: version,
            textEdit: {
              range: new monaco.Range(edit.line, edit.startColumn, edit.line, edit.endColumn),
              text: edit.newText,
            },
          })),
      }
    },
  })
}
