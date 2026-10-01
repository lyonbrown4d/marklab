import { MermaidLanguageProvider } from '@electron/services/mermaidLanguage/provider.js'
import type {
  LanguageCompletionContext,
  LanguageDiagnosticsContext,
  LanguageIntelligenceProvider,
} from '@electron/services/languageIntelligence/service.js'

export class MermaidLanguageIntelligenceProvider implements LanguageIntelligenceProvider {
  readonly languageIds = ['mermaid']

  constructor(private readonly mermaid = new MermaidLanguageProvider()) {}

  async completion(context: LanguageCompletionContext) {
    return this.mermaid.provideCompletions(
      {
        uri: context.document.uri,
        languageId: context.document.languageId,
        version: context.document.version,
        text: context.document.getText(),
      },
      context.position,
    )
  }

  async diagnostics(context: LanguageDiagnosticsContext) {
    return this.mermaid.provideDiagnostics({
      uri: context.document.uri,
      languageId: context.document.languageId,
      version: context.document.version,
      text: context.document.getText(),
    })
  }
}
