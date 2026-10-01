import { getElectronRuntime } from '@/runtime/electron'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

export const languageIntelligenceApi: LanguageIntelligenceApi = {
  openDocument: (request) => getElectronRuntime().languageIntelligence.openDocument(request),
  changeDocument: (request) => getElectronRuntime().languageIntelligence.changeDocument(request),
  closeDocument: (request) => getElectronRuntime().languageIntelligence.closeDocument(request),
  completion: (request) => getElectronRuntime().languageIntelligence.completion(request),
  diagnostics: (request) => getElectronRuntime().languageIntelligence.diagnostics(request),
}
