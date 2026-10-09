import type { editor as MonacoEditor } from 'monaco-editor'
import { isDesktopRuntime } from '@/runtime/environment'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { FileViewKind } from '@/store/appTypes'
import { requestFocusSourcePosition } from '@/utils/editorNavigation'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'

type MonacoMouseEvent = Parameters<
  Parameters<MonacoEditor.IStandaloneCodeEditor['onMouseDown']>[0]
>[0]

export const registerMarkdownDefinitionClick = ({
  editor,
  getContext,
  getWorkspaceKey,
  onOpenFileView,
}: {
  editor: MonacoEditor.IStandaloneCodeEditor
  getContext: () => MarkdownSourceCompletionContext
  getWorkspaceKey: () => string
  onOpenFileView?: (path: string, view: FileViewKind) => void
}) => {
  let disposed = false
  let latestRequest = 0
  const registration = editor.onMouseDown((event) => {
    handleDefinitionClick({
      event,
      editor,
      context: getContext(),
      getContext,
      getWorkspaceKey,
      onOpenFileView,
      requestId: ++latestRequest,
      isCurrentRequest: (requestId) => !disposed && requestId === latestRequest,
    })
  })
  return {
    dispose: () => {
      disposed = true
      latestRequest += 1
      registration.dispose()
    },
  }
}

const handleDefinitionClick = ({
  event,
  editor,
  context,
  getContext,
  getWorkspaceKey,
  onOpenFileView,
  requestId,
  isCurrentRequest,
}: {
  event: MonacoMouseEvent
  editor: MonacoEditor.IStandaloneCodeEditor
  context: MarkdownSourceCompletionContext
  getContext: () => MarkdownSourceCompletionContext
  getWorkspaceKey: () => string
  onOpenFileView?: (path: string, view: FileViewKind) => void
  requestId: number
  isCurrentRequest: (requestId: number) => boolean
}) => {
  const browserEvent = event.event.browserEvent
  if (!(browserEvent.ctrlKey || browserEvent.metaKey)) return
  if (!event.target.position) return

  const model = editor.getModel()
  if (!model || !context.activePath || !isDesktopRuntime()) return
  const sourcePath = context.activePath
  const sourceVersion = model.getVersionId()
  const workspaceKey = getWorkspaceKey()

  event.event.preventDefault()
  void markdownLanguageApi
    .getDefinition({
      path: context.activePath,
      content: model.getValue(),
      line: event.target.position.lineNumber,
      column: event.target.position.column,
    })
    .then((definition) => {
      if (!definition) return
      if (
        !isCurrentRequest(requestId) ||
        editor.getModel() !== model ||
        model.isDisposed() ||
        model.getVersionId() !== sourceVersion ||
        getContext().activePath !== sourcePath ||
        getWorkspaceKey() !== workspaceKey
      ) {
        return
      }
      requestFocusSourcePosition({ ...definition, workspaceKey })
      if (definition.path !== sourcePath) {
        onOpenFileView?.(definition.path, 'source')
      }
    })
    .catch(() => undefined)
}
