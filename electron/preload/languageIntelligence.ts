import { ipcRenderer, type IpcRenderer } from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import type {
  LanguageDocumentAck,
  LanguageDocumentCloseAck,
  LanguageIntelligenceApi,
} from '@/types/languageIntelligence.js'
import type { CompletionList } from 'vscode-languageserver-types'
import type { Diagnostic } from 'vscode-languageserver-types'

type LanguageIntelligenceIpcRenderer = Pick<IpcRenderer, 'invoke'>

export const createLanguageIntelligencePreloadSurface = (
  renderer: LanguageIntelligenceIpcRenderer = ipcRenderer,
): LanguageIntelligenceApi => ({
  openDocument: (request) =>
    renderer.invoke(
      nativeIpcChannels.languageDocumentOpen,
      request,
    ) as Promise<LanguageDocumentAck>,
  changeDocument: (request) =>
    renderer.invoke(
      nativeIpcChannels.languageDocumentChange,
      request,
    ) as Promise<LanguageDocumentAck>,
  closeDocument: (request) =>
    renderer.invoke(
      nativeIpcChannels.languageDocumentClose,
      request,
    ) as Promise<LanguageDocumentCloseAck>,
  completion: (request) =>
    renderer.invoke(nativeIpcChannels.languageCompletion, request) as Promise<CompletionList>,
  diagnostics: (request) =>
    renderer.invoke(nativeIpcChannels.languageDiagnostics, request) as Promise<Diagnostic[]>,
})
