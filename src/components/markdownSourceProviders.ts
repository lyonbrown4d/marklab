import type { editor as MonacoEditor } from 'monaco-editor'
import type { FileViewKind } from '@/store/appTypes'
import { registerMarkdownCodeActionProvider } from '@/components/markdownSourceCodeActions'
import {
  registerMarkdownCompletionProvider,
  type MarkdownSourceCompletionContext,
} from '@/components/markdownSourceCompletion'
import { registerMarkdownDefinitionClick } from '@/components/markdownSourceDefinition'
import { registerMarkdownDocumentSymbolProvider } from '@/components/markdownSourceDocumentSymbols'
import { registerMarkdownHoverProvider } from '@/components/markdownSourceHover'
import { registerMarkdownLinkDecorations } from '@/components/markdownSourceLinkDecorations'
import { registerMarkdownReferenceProvider } from '@/components/markdownSourceReferences'
import { registerMarkdownRenameProvider } from '@/components/markdownSourceRename'
import { registerMarkdownSourceInlineCompletion } from '@/components/markdownSourceInlineCompletion'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

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
  const inlineCompletionDisposable =
    typeof monaco.languages.registerInlineCompletionsProvider === 'function'
      ? registerMarkdownSourceInlineCompletion({
          monaco,
          editor,
          getDocumentKey: () => getContext().activePath,
          getPreferences: usePreferencesStore.getState,
          requestCompletion: requestAiInlineCompletion,
          subscribePreferences: (listener) => usePreferencesStore.subscribe(listener),
        })
      : { dispose: () => undefined }
  const disposables: Disposable[] = [
    registerMarkdownCompletionProvider(monaco, getContext),
    inlineCompletionDisposable,
    registerMarkdownDocumentSymbolProvider(monaco, getContext),
    editor.onDidChangeModelContent(() => scheduleDiagnostics()),
    registerMarkdownDefinitionClick({ editor, getContext, onOpenFileView }),
    registerMarkdownReferenceProvider(monaco, getContext),
    registerMarkdownHoverProvider(monaco, getContext),
    registerMarkdownRenameProvider(monaco, getContext),
    registerMarkdownCodeActionProvider({ monaco, editor, getContext, onOpenFileView }),
    registerMarkdownLinkDecorations(monaco, editor),
  ]

  return {
    dispose: () => {
      for (const disposable of disposables) disposable.dispose()
    },
  }
}
