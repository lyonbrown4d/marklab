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
  onOpenFileView,
}: {
  editor: MonacoEditor.IStandaloneCodeEditor
  getContext: () => MarkdownSourceCompletionContext
  onOpenFileView?: (path: string, view: FileViewKind) => void
}) => {
  return editor.onMouseDown((event) => {
    handleDefinitionClick({
      event,
      editor,
      context: getContext(),
      onOpenFileView,
    })
  })
}

const handleDefinitionClick = ({
  event,
  editor,
  context,
  onOpenFileView,
}: {
  event: MonacoMouseEvent
  editor: MonacoEditor.IStandaloneCodeEditor
  context: MarkdownSourceCompletionContext
  onOpenFileView?: (path: string, view: FileViewKind) => void
}) => {
  const browserEvent = event.event.browserEvent
  if (!(browserEvent.ctrlKey || browserEvent.metaKey)) return
  if (!event.target.position) return

  const model = editor.getModel()
  if (!model || !context.activePath || !isDesktopRuntime()) return

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
      if (definition.path !== context.activePath) {
        onOpenFileView?.(definition.path, 'source')
      }
      window.setTimeout(
        () => requestFocusSourcePosition(definition),
        definition.path === context.activePath ? 0 : 80,
      )
    })
    .catch(() => undefined)
}
