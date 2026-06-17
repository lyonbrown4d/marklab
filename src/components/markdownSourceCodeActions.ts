import type { editor as MonacoEditor } from 'monaco-editor'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { FileViewKind } from '@/store/appTypes'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'

type MonacoModule = typeof import('monaco-editor')

export const registerMarkdownCodeActionProvider = ({
  monaco,
  editor,
  getContext,
  onOpenFileView,
}: {
  monaco: MonacoModule
  editor: MonacoEditor.IStandaloneCodeEditor
  getContext: () => MarkdownSourceCompletionContext
  onOpenFileView?: (path: string, view: FileViewKind) => void
}) => {
  const createFileCommandId = editor.addCommand(0, (_accessor, path: string) => {
    void fsApi
      .createFile(path)
      .then(() => onOpenFileView?.(path, 'source'))
      .catch(() => undefined)
  })

  return monaco.languages.registerCodeActionProvider('markdown', {
    provideCodeActions: async (model, range) => {
      const context = getContext()
      if (!context.activePath || !isDesktopRuntime()) return { actions: [], dispose: () => {} }

      const actions = await markdownLanguageApi
        .getCodeActions({
          path: context.activePath,
          content: model.getValue(),
          line: range.startLineNumber,
          column: range.startColumn,
        })
        .catch(() => [])

      return {
        actions: actions.map((action) =>
          action.kind === 'create-file'
            ? {
                title: action.title,
                kind: 'quickfix',
                isPreferred: action.isPreferred,
                command: createFileCommandId
                  ? { id: createFileCommandId, title: action.title, arguments: [action.path] }
                  : undefined,
              }
            : {
                title: action.title,
                kind: 'quickfix',
                isPreferred: action.isPreferred,
                edit: {
                  edits: [
                    {
                      resource: model.uri,
                      versionId: model.getVersionId(),
                      textEdit: {
                        range: new monaco.Range(
                          action.edit.line,
                          action.edit.startColumn,
                          action.edit.line,
                          action.edit.endColumn,
                        ),
                        text: action.edit.newText,
                      },
                    },
                  ],
                },
              },
        ),
        dispose: () => {},
      }
    },
  })
}
