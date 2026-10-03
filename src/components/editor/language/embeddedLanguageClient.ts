import type { EmbeddedLanguageClient } from '@/components/editor/language/embeddedLanguageSession'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'

export const embeddedLanguageClient: EmbeddedLanguageClient = {
  openDocument: async ({ uri, languageId, version, text }) => {
    await languageIntelligenceApi.openDocument({ uri, languageId, path: null, version, text })
  },
  changeDocument: async (request) => {
    await languageIntelligenceApi.changeDocument(request)
  },
  closeDocument: async (request) => {
    await languageIntelligenceApi.closeDocument(request)
  },
  completion: (request) => languageIntelligenceApi.completion(request),
  diagnostics: (request) => languageIntelligenceApi.diagnostics(request),
}
