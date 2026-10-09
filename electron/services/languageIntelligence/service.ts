import { TextDocument } from 'vscode-languageserver-textdocument'
import type { CompletionList, Diagnostic, Position } from 'vscode-languageserver-types'

import { MarkdownLanguageIntelligenceProvider } from '@electron/services/languageIntelligence/markdownProvider'
import { MermaidLanguageIntelligenceProvider } from '@electron/services/languageIntelligence/mermaidProvider'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'
import {
  LANGUAGE_DOCUMENT_MAX_TEXT_LENGTH,
  type LanguageCompletionRequest,
  type LanguageDocumentAck,
  type LanguageDocumentChangeRequest,
  type LanguageDocumentCloseAck,
  type LanguageDocumentCloseRequest,
  type LanguageDocumentOpenRequest,
  type LanguageDiagnosticsRequest,
} from '@/types/languageIntelligence'

const MAX_DOCUMENTS_PER_CLIENT = 128
const MAX_DOCUMENT_TEXT_PER_CLIENT = 64 * 1024 * 1024

type DocumentSession = {
  consumers: number
  document: TextDocument
  path: string | null
}

type LanguageDocumentContext = Pick<DocumentSession, 'document' | 'path'>

export type LanguageCompletionContext = LanguageDocumentContext & {
  position: Position
  workspace: WorkspaceService
}

export type LanguageDiagnosticsContext = LanguageDocumentContext & {
  workspace: WorkspaceService
}

export type LanguageIntelligenceProvider = {
  readonly languageIds: readonly string[]
  completion: (context: LanguageCompletionContext) => Promise<CompletionList>
  diagnostics?: (context: LanguageDiagnosticsContext) => Promise<Diagnostic[]>
}

export type LanguageIntelligenceServiceContract = {
  openDocument: (ownerId: number, request: LanguageDocumentOpenRequest) => LanguageDocumentAck
  changeDocument: (ownerId: number, request: LanguageDocumentChangeRequest) => LanguageDocumentAck
  closeDocument: (
    ownerId: number,
    request: LanguageDocumentCloseRequest,
  ) => LanguageDocumentCloseAck
  closeClient: (ownerId: number) => void
  completion: (
    ownerId: number,
    workspace: WorkspaceService,
    request: LanguageCompletionRequest,
  ) => Promise<CompletionList>
  diagnostics: (
    ownerId: number,
    workspace: WorkspaceService,
    request: LanguageDiagnosticsRequest,
  ) => Promise<Diagnostic[]>
}

export class LanguageIntelligenceService implements LanguageIntelligenceServiceContract {
  private readonly clients = new Map<number, Map<string, DocumentSession>>()
  private readonly providers = new Map<string, LanguageIntelligenceProvider>()

  constructor(
    providers: readonly LanguageIntelligenceProvider[] = [
      new MarkdownLanguageIntelligenceProvider(),
      new MermaidLanguageIntelligenceProvider(),
    ],
  ) {
    for (const provider of providers) {
      for (const languageId of provider.languageIds) {
        if (this.providers.has(languageId)) {
          throw new Error(
            `A language intelligence provider is already registered for ${languageId}`,
          )
        }
        this.providers.set(languageId, provider)
      }
    }
  }

  openDocument(ownerId: number, request: LanguageDocumentOpenRequest): LanguageDocumentAck {
    const provider = this.providers.get(request.languageId)
    if (!provider) throw new Error(`Unsupported language: ${request.languageId}`)
    const documents = this.clients.get(ownerId) ?? new Map<string, DocumentSession>()
    const existing = documents.get(request.uri)
    if (existing) {
      const identical =
        existing.document.languageId === request.languageId &&
        existing.document.version === request.version &&
        existing.document.getText() === request.text &&
        existing.path === (request.path ?? null)
      if (!identical)
        throw new Error(`Document is already open with different content: ${request.uri}`)
      existing.consumers += 1
      return { ok: true, version: existing.document.version }
    }
    if (documents.size >= MAX_DOCUMENTS_PER_CLIENT) {
      throw new Error('Too many language documents are open for this renderer')
    }
    if (this.clientTextLength(ownerId) + request.text.length > MAX_DOCUMENT_TEXT_PER_CLIENT) {
      throw new Error('Language documents exceed the per-renderer text limit')
    }
    documents.set(request.uri, {
      consumers: 1,
      document: TextDocument.create(request.uri, request.languageId, request.version, request.text),
      path: request.path ?? null,
    })
    this.clients.set(ownerId, documents)
    return { ok: true, version: request.version }
  }

  changeDocument(ownerId: number, request: LanguageDocumentChangeRequest): LanguageDocumentAck {
    const session = this.requireDocument(ownerId, request.uri)
    if (request.version !== session.document.version + 1) {
      throw new Error(
        'Document change version must be newer and exactly the next version after the current version',
      )
    }

    let updated = session.document
    for (const change of request.changes) {
      assertRangeInDocument(updated, change.range.start, change.range.end)
      updated = TextDocument.update(updated, [change], request.version)
      if (updated.getText().length > LANGUAGE_DOCUMENT_MAX_TEXT_LENGTH) {
        throw new Error('Language document exceeds the maximum text length')
      }
    }
    if (
      this.clientTextLength(ownerId, { uri: request.uri, length: updated.getText().length }) >
      MAX_DOCUMENT_TEXT_PER_CLIENT
    ) {
      throw new Error('Language documents exceed the per-renderer text limit')
    }
    session.document = updated
    return { ok: true, version: updated.version }
  }

  closeDocument(ownerId: number, request: LanguageDocumentCloseRequest): LanguageDocumentCloseAck {
    const documents = this.clients.get(ownerId)
    const session = documents?.get(request.uri)
    if (session && session.consumers > 1) {
      session.consumers -= 1
    } else {
      documents?.delete(request.uri)
    }
    if (documents?.size === 0) this.clients.delete(ownerId)
    return { ok: true }
  }

  closeClient(ownerId: number): void {
    this.clients.delete(ownerId)
  }

  async completion(
    ownerId: number,
    workspace: WorkspaceService,
    request: LanguageCompletionRequest,
  ): Promise<CompletionList> {
    const session = this.requireDocument(ownerId, request.uri)
    if (request.version !== session.document.version) {
      throw new Error('Completion version does not match the open document version')
    }
    assertPositionInDocument(session.document, request.position)
    const provider = this.providers.get(session.document.languageId)
    if (!provider) throw new Error(`Unsupported language: ${session.document.languageId}`)
    return provider.completion({ ...session, position: request.position, workspace })
  }

  async diagnostics(
    ownerId: number,
    workspace: WorkspaceService,
    request: LanguageDiagnosticsRequest,
  ): Promise<Diagnostic[]> {
    const session = this.requireVersionedDocument(ownerId, request)
    const provider = this.providers.get(session.document.languageId)
    if (!provider) throw new Error(`Unsupported language: ${session.document.languageId}`)
    return provider.diagnostics?.({ ...session, workspace }) ?? []
  }

  private requireDocument(ownerId: number, uri: string): DocumentSession {
    const session = this.clients.get(ownerId)?.get(uri)
    if (!session) throw new Error(`Language document is not open: ${uri}`)
    return session
  }

  private requireVersionedDocument(
    ownerId: number,
    request: LanguageDiagnosticsRequest,
  ): DocumentSession {
    const session = this.requireDocument(ownerId, request.uri)
    if (request.version !== session.document.version) {
      throw new Error('Request version does not match the open document version')
    }
    return session
  }

  private clientTextLength(ownerId: number, replacement?: { uri: string; length: number }): number {
    let total = 0
    for (const [uri, session] of this.clients.get(ownerId) ?? []) {
      total += replacement?.uri === uri ? replacement.length : session.document.getText().length
    }
    return total
  }
}

const assertPositionInDocument = (document: TextDocument, position: Position): void => {
  const normalized = document.positionAt(document.offsetAt(position))
  if (normalized.line !== position.line || normalized.character !== position.character) {
    throw new Error('Position is outside the language document')
  }
}

const assertRangeInDocument = (document: TextDocument, start: Position, end: Position): void => {
  assertPositionInDocument(document, start)
  assertPositionInDocument(document, end)
  if (document.offsetAt(start) > document.offsetAt(end)) {
    throw new Error('Document change range start must not be after its end')
  }
}
