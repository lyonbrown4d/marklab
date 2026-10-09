import type { editor as MonacoEditor } from 'monaco-editor'
import type { FileViewKind } from '@/store/appTypes'
import { registerMarkdownSourceDocumentSession } from '@/components/markdownSourceDocumentSession'
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
import { registerMarkdownSourceLanguageDiagnostics } from '@/components/markdownSourceLanguageDiagnostics'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type MonacoModule = typeof import('monaco-editor')
type Disposable = { dispose: () => void }

export const registerMarkdownSourceProviders = ({
  monaco,
  editor,
  getContext,
  getWorkspaceKey,
  onOpenFileView,
  scheduleDiagnostics,
}: {
  monaco: MonacoModule
  editor: MonacoEditor.IStandaloneCodeEditor
  getContext: () => MarkdownSourceCompletionContext
  getWorkspaceKey: () => string
  onOpenFileView?: (path: string, view: FileViewKind) => void
  scheduleDiagnostics: () => void
}): Disposable => {
  const documentSession = registerMarkdownSourceDocumentSession({
    client: languageIntelligenceApi,
    editor,
    getPath: () => getContext().activePath,
  })
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
    documentSession,
    registerMarkdownCompletionProvider(monaco, getContext, documentSession, {
      getWorkspaceKey,
      ownerEditor: editor,
    }),
    registerMarkdownSourceLanguageDiagnostics({
      client: languageIntelligenceApi,
      documentSession,
      editor,
      monaco,
    }),
    inlineCompletionDisposable,
    registerMarkdownDocumentSymbolProvider(monaco, getContext),
    editor.onDidChangeModelContent(() => scheduleDiagnostics()),
    registerMarkdownDefinitionClick({ editor, getContext, getWorkspaceKey, onOpenFileView }),
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
