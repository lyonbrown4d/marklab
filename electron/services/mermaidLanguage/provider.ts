import {
  CompletionList,
  InsertTextFormat,
  TextEdit,
  type CompletionItem,
  type Diagnostic,
  type Position,
} from 'vscode-languageserver-types'

import {
  classMemberStatements,
  diagramDeclarations,
  erAttributeStatements,
  statementCatalog,
  type MermaidCompletionTemplate,
} from '@electron/services/mermaidLanguage/completionCatalog'
import { mermaidCompletionContext } from '@electron/services/mermaidLanguage/completionContext'
import { validateMermaidSyntax } from '@electron/services/mermaidLanguage/defaultValidator'
import {
  documentTooLargeDiagnostic,
  mermaidDiagnostics,
} from '@electron/services/mermaidLanguage/diagnostics'
import type {
  MermaidLanguageProviderOptions,
  MermaidTextDocument,
  MermaidValidationOptions,
  MermaidValidator,
} from '@electron/services/mermaidLanguage/types'

export type {
  MermaidDiagramKind,
  MermaidLanguageProviderOptions,
  MermaidTextDocument,
  MermaidValidationIssue,
  MermaidValidationOptions,
  MermaidValidator,
} from '@electron/services/mermaidLanguage/types'

export const DEFAULT_MAX_MERMAID_DOCUMENT_LENGTH = 128 * 1024

export class MermaidLanguageProvider {
  private readonly maxDocumentLength: number
  private readonly validator: MermaidValidator | undefined

  constructor(options: MermaidLanguageProviderOptions = {}) {
    this.maxDocumentLength = normalizeDocumentLimit(options.maxDocumentLength)
    this.validator = options.validator ?? validateMermaidSyntax
  }

  provideCompletions(document: MermaidTextDocument, position: Position): CompletionList {
    if (document.text.length > this.maxDocumentLength) return CompletionList.create([], false)

    const context = mermaidCompletionContext(document.text, position)
    if (!context) return CompletionList.create([], false)

    const templates = context.diagram
      ? context.insideBody && context.diagram === 'class'
        ? classMemberStatements
        : context.insideBody && context.diagram === 'er'
          ? erAttributeStatements
          : statementCatalog[context.diagram]
      : context.declarationRecognized
        ? []
        : diagramDeclarations
    const items = templates.map((template, index) =>
      completionItem(template, context.replacementRange, index),
    )
    return CompletionList.create(items, false)
  }

  async provideDiagnostics(
    document: MermaidTextDocument,
    options: MermaidValidationOptions = {},
  ): Promise<Diagnostic[]> {
    if (document.text.length > this.maxDocumentLength) {
      return [documentTooLargeDiagnostic(document, this.maxDocumentLength)]
    }
    return mermaidDiagnostics(document, this.validator, options)
  }
}

const completionItem = (
  template: MermaidCompletionTemplate,
  replacementRange: Parameters<typeof TextEdit.replace>[0],
  index: number,
): CompletionItem => ({
  detail: template.detail,
  filterText: template.label,
  insertTextFormat: InsertTextFormat.Snippet,
  kind: template.kind,
  label: template.label,
  sortText: String(index).padStart(3, '0'),
  textEdit: TextEdit.replace(replacementRange, template.newText),
})

const normalizeDocumentLimit = (value: number | undefined): number => {
  if (value == null) return DEFAULT_MAX_MERMAID_DOCUMENT_LENGTH
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError('maxDocumentLength must be a positive safe integer')
  }
  return value
}
