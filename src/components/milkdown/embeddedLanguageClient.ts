import type { EmbeddedLanguageClient } from '@/components/milkdown/embeddedLanguageSession'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

export const createEmbeddedLanguageClient = (
  api: LanguageIntelligenceApi,
): EmbeddedLanguageClient => ({
  openDocument: async ({ uri, languageId, version, text }) => {
    await api.openDocument({ uri, languageId, path: null, version, text })
  },
  changeDocument: async (request) => {
    await api.changeDocument(request)
  },
  closeDocument: async (request) => {
    await api.closeDocument(request)
  },
  completion: ({ uri, version, position }) => api.completion({ uri, version, position }),
  diagnostics: ({ uri, version }) => api.diagnostics({ uri, version }),
})
