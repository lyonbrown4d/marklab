import { getDesktopRuntime } from '@/runtime/desktop'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

export const languageIntelligenceApi: LanguageIntelligenceApi = {
  openDocument: (request) => getDesktopRuntime().languageIntelligence.openDocument(request),
  changeDocument: (request) => getDesktopRuntime().languageIntelligence.changeDocument(request),
  closeDocument: (request) => getDesktopRuntime().languageIntelligence.closeDocument(request),
  completion: (request) => getDesktopRuntime().languageIntelligence.completion(request),
  diagnostics: (request) => getDesktopRuntime().languageIntelligence.diagnostics(request),
}
