import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import type { WorkspaceSearchIndexBackend } from '@electron/services/workspace/workspaceSearchIndex.js'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'

type RawSearchResult = {
  column?: unknown
  end_column?: unknown
  line?: unknown
  path?: unknown
  score?: unknown
  snippet?: unknown
  snippet_highlights?: unknown
  title?: unknown
}

export class KnowledgeEngineWorkspaceSearchBackend implements WorkspaceSearchIndexBackend {
  constructor(private readonly knowledgeEngine: KnowledgeEngineService) {}

  async open(workspaceId: string, indexPath: string): Promise<void> {
    await this.knowledgeEngine.request('workspace/open', { workspaceId, indexPath })
  }

  async close(workspaceId: string): Promise<void> {
    await this.knowledgeEngine.request('workspace/close', { workspaceId })
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    const result = await this.knowledgeEngine.request('workspace/hasDocuments', { workspaceId })
    return Boolean(readObject(result).hasDocuments)
  }

  async rebuild(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    await this.knowledgeEngine.request('workspace/rebuild', { workspaceId, documents })
  }

  async upsertDocument(workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    await this.knowledgeEngine.request('workspace/upsertDocument', { workspaceId, document })
  }

  async removeDocument(workspaceId: string, path: string): Promise<void> {
    await this.knowledgeEngine.request('workspace/removeDocument', { workspaceId, path })
  }

  async removePathPrefix(workspaceId: string, prefix: string): Promise<void> {
    await this.knowledgeEngine.request('workspace/removePathPrefix', { workspaceId, prefix })
  }

  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    const result = await this.knowledgeEngine.request('workspace/search', {
      workspaceId,
      query,
      limit,
    })

    return Array.isArray(result)
      ? result.flatMap((item) => normalizeSearchResult(item as RawSearchResult))
      : []
  }
}

const normalizeSearchResult = (result: RawSearchResult): FsSearchResult[] => {
  if (typeof result.path !== 'string') return []

  return [
    {
      path: result.path,
      title: stringOr(result.title, result.path),
      line: positiveIntegerOr(result.line, 1),
      column: positiveIntegerOr(result.column, 1),
      end_column: positiveIntegerOr(result.end_column, 1),
      snippet: stringOr(result.snippet, result.path),
      snippet_highlights: normalizeHighlights(result.snippet_highlights),
      score: numberOr(result.score, 0),
    },
  ]
}

const normalizeHighlights = (value: unknown): Array<{ start: number; end: number }> => {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    const record = readObject(item)
    const start = integerOr(record.start, 0)
    const end = integerOr(record.end, 0)
    return end > start ? [{ start, end }] : []
  })
}

const readObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

const stringOr = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value : fallback

const numberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const integerOr = (value: unknown, fallback: number) => Math.trunc(numberOr(value, fallback))

const positiveIntegerOr = (value: unknown, fallback: number) => {
  const next = integerOr(value, fallback)
  return next > 0 ? next : fallback
}
