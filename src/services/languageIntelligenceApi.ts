import { getDesktopRuntime } from '@/runtime/desktop'
import {
  parseLanguageCompletion,
  parseLanguageDiagnostics,
} from '@/services/languageProtocolAdapter'
import type {
  LanguageCompletionRequest,
  LanguageDiagnosticsRequest,
  LanguageDocumentChangeRequest,
  LanguageDocumentCloseRequest,
  LanguageDocumentOpenRequest,
} from '@/types/languageIntelligence'

export const languageIntelligenceApi = {
  openDocument: (request: LanguageDocumentOpenRequest) =>
    getDesktopRuntime().languageIntelligence.openDocument(request),
  changeDocument: (request: LanguageDocumentChangeRequest) =>
    getDesktopRuntime().languageIntelligence.changeDocument(request),
  closeDocument: (request: LanguageDocumentCloseRequest) =>
    getDesktopRuntime().languageIntelligence.closeDocument(request),
  completion: async (request: LanguageCompletionRequest) =>
    parseLanguageCompletion(await getDesktopRuntime().languageIntelligence.completion(request)),
  diagnostics: async (request: LanguageDiagnosticsRequest) =>
    parseLanguageDiagnostics(await getDesktopRuntime().languageIntelligence.diagnostics(request)),
}
