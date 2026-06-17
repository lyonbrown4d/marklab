import type { editor as MonacoEditor } from 'monaco-editor'
import type { FileViewKind } from '@/store/appTypes'
import { registerMarkdownCodeActionProvider } from '@/components/markdownSourceCodeActions'
import {
  registerMarkdownCompletionProvider,
  type MarkdownSourceCompletionContext,
} from '@/components/markdownSourceCompletion'
import { registerMarkdownDefinitionClick } from '@/components/markdownSourceDefinition'
import { registerMarkdownHoverProvider } from '@/components/markdownSourceHover'
import { registerMarkdownReferenceProvider } from '@/components/markdownSourceReferences'
import { registerMarkdownRenameProvider } from '@/components/markdownSourceRename'

type MonacoModule = typeof import('monaco-editor')
type Disposable = { dispose: () => void }

export const registerMarkdownSourceProviders = ({
  monaco,
  editor,
  getContext,
  onOpenFileView,
  scheduleDiagnostics,
}: {
  monaco: MonacoModule
  editor: MonacoEditor.IStandaloneCodeEditor
  getContext: () => MarkdownSourceCompletionContext
  onOpenFileView?: (path: string, view: FileViewKind) => void
  scheduleDiagnostics: () => void
}): Disposable => {
  const disposables: Disposable[] = [
    registerMarkdownCompletionProvider(monaco, getContext),
    editor.onDidChangeModelContent(() => scheduleDiagnostics()),
    registerMarkdownDefinitionClick({ editor, getContext, onOpenFileView }),
    registerMarkdownReferenceProvider(monaco, getContext),
    registerMarkdownHoverProvider(monaco, getContext),
    registerMarkdownRenameProvider(monaco, getContext),
    registerMarkdownCodeActionProvider({ monaco, editor, getContext, onOpenFileView }),
  ]

  return {
    dispose: () => {
      for (const disposable of disposables) disposable.dispose()
    },
  }
}
