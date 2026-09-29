import type {
  KnowledgeDocumentChangeInput,
  KnowledgeMarkdownDocumentSymbol,
  KnowledgeMarkdownLink,
  KnowledgeOpenDocumentInput,
  KnowledgeResyncDocumentInput,
  KnowledgeSyncResponse,
} from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'

type OpenDocument = {
  content: string
  version: string
}

export class NodeMarkdownOverlay {
  private readonly documents = new Map<string, OpenDocument>()

  open(document: KnowledgeOpenDocumentInput): KnowledgeSyncResponse {
    return this.replace(document.documentId, document.content, document.version)
  }

  resync(document: KnowledgeResyncDocumentInput): KnowledgeSyncResponse {
    return this.replace(document.documentId, document.content, document.version)
  }

  change(change: KnowledgeDocumentChangeInput): KnowledgeSyncResponse {
    const document = this.documents.get(change.documentId)
    if (!document) return resyncRequired(change.documentId, 'document is not open')
    if (document.version !== String(change.baseVersion)) {
      return resyncRequired(change.documentId, 'document version mismatch')
    }

    let content = document.content
    for (const edit of change.changes) {
      if (!edit.range) return resyncRequired(change.documentId, 'invalid edit range')
      const start = offsetForPosition(content, edit.range.start?.line, edit.range.start?.character)
      const end = offsetForPosition(content, edit.range.end?.line, edit.range.end?.character)
      if (start === null || end === null || start > end) {
        return resyncRequired(change.documentId, 'invalid edit range')
      }
      content = `${content.slice(0, start)}${edit.text}${content.slice(end)}`
    }

    return this.replace(change.documentId, content, change.version)
  }

  close(documentId: string): KnowledgeSyncResponse {
    this.documents.delete(documentId)
    return acknowledged(documentId, 0)
  }

  symbols(documentId: string, version: number | string): KnowledgeMarkdownDocumentSymbol[] {
    const document = this.current(documentId, version)
    if (!document) return []
    return parseMarkdownDocument(documentId, document.content).headings.map((heading) => ({
      kind: 12,
      level: heading.level,
      name: heading.text,
      range: pointRange(heading.line, heading.column),
      slug: heading.slug,
    }))
  }

  links(documentId: string, version: number | string): KnowledgeMarkdownLink[] {
    const document = this.current(documentId, version)
    if (!document) return []
    return parseMarkdownDocument(documentId, document.content).links.map((link) => ({
      isExternal: link.is_external,
      range: pointRange(link.line, link.column),
      sourceDocumentId: documentId,
      target: link.target,
      text: link.text,
    }))
  }

  clear(): void {
    this.documents.clear()
  }

  private replace(
    documentId: string,
    content: string,
    version: number | string,
  ): KnowledgeSyncResponse {
    this.documents.set(documentId, { content, version: String(version) })
    return acknowledged(documentId, version)
  }

  private current(documentId: string, version: number | string): OpenDocument | null {
    const document = this.documents.get(documentId)
    return document?.version === String(version) ? document : null
  }
}

const acknowledged = (documentId: string, version: number | string): KnowledgeSyncResponse => ({
  acknowledged: { documentId, version: String(version) },
})

const resyncRequired = (documentId: string, reason: string): KnowledgeSyncResponse => ({
  resyncRequired: { documentId, reason },
})

const pointRange = (line: number, column: number) => {
  const position = { character: Math.max(column - 1, 0), line: Math.max(line - 1, 0) }
  return { end: position, start: position }
}

const offsetForPosition = (
  content: string,
  line: number | undefined,
  character: number | undefined,
): number | null => {
  if (line === undefined || character === undefined || line < 0 || character < 0) return null
  const lines = content.split('\n')
  if (line >= lines.length || character > (lines[line]?.length ?? 0)) return null
  let offset = 0
  for (let index = 0; index < line; index += 1) offset += (lines[index]?.length ?? 0) + 1
  return offset + character
}
