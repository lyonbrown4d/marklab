import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import type { FsMarkdownDiagnostic, FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import { createMarkdownCompletions } from '@electron/services/markdownLanguage/completions.js'
import { getMarkdownDefinition } from '@electron/services/markdownLanguage/definitions.js'
import { getMarkdownReferences } from '@electron/services/markdownLanguage/references.js'
import type {
  CompletionRequest,
  DiagnosticsRequest,
  MarkdownLanguageDefinition,
  MarkdownLanguageCompletionItem,
  MarkdownLanguageReference,
} from '@electron/services/markdownLanguage/types.js'

type WorkspaceIndexCacheEntry = {
  expiresAt: number
  promise: Promise<FsWorkspaceIndex>
}

const INDEX_CACHE_TTL_MS = 750

export class EmbeddedMarkdownLanguageService {
  private readonly indexCache = new WeakMap<WorkspaceService, WorkspaceIndexCacheEntry>()

  async getCompletions(
    workspace: WorkspaceService,
    value: unknown,
  ): Promise<MarkdownLanguageCompletionItem[]> {
    const request = completionRequest(value)
    return createMarkdownCompletions(request, () => this.workspaceIndex(workspace))
  }

  async getDiagnostics(
    workspace: WorkspaceService,
    value: unknown,
  ): Promise<FsMarkdownDiagnostic[]> {
    const request = diagnosticsRequest(value)
    return workspace.analyzeMarkdownBuffer({
      path: request.path,
      content: request.content,
    })
  }

  async getDefinition(
    workspace: WorkspaceService,
    value: unknown,
  ): Promise<MarkdownLanguageDefinition | null> {
    const request = completionRequest(value)
    return getMarkdownDefinition(request, () => this.workspaceIndex(workspace))
  }

  async getReferences(
    workspace: WorkspaceService,
    value: unknown,
  ): Promise<MarkdownLanguageReference[]> {
    const request = completionRequest(value)
    return getMarkdownReferences(request, () => this.workspaceIndex(workspace))
  }

  private workspaceIndex(workspace: WorkspaceService): Promise<FsWorkspaceIndex> {
    const now = Date.now()
    const cached = this.indexCache.get(workspace)
    if (cached && cached.expiresAt > now) return cached.promise

    const promise = workspace.workspaceIndex()
    this.indexCache.set(workspace, {
      expiresAt: now + INDEX_CACHE_TTL_MS,
      promise,
    })
    return promise
  }
}

const completionRequest = (value: unknown): CompletionRequest => {
  const payload = objectArg(value)
  const line = numberArg(payload, 'line')
  const column = numberArg(payload, 'column')
  return {
    path: nullableStringArg(payload, 'path'),
    content: stringArg(payload, 'content'),
    line: Math.max(1, Math.floor(line)),
    column: Math.max(1, Math.floor(column)),
  }
}

const diagnosticsRequest = (value: unknown): DiagnosticsRequest => {
  const payload = objectArg(value)
  return {
    path: stringArg(payload, 'path'),
    content: stringArg(payload, 'content'),
  }
}

const objectArg = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') throw new Error('Payload must be an object')
  return value as Record<string, unknown>
}

const stringArg = (value: Record<string, unknown>, key: string): string => {
  const result = value[key]
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

const nullableStringArg = (value: Record<string, unknown>, key: string): string | null => {
  const result = value[key]
  if (result == null) return null
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

const numberArg = (value: Record<string, unknown>, key: string): number => {
  const result = value[key]
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error(`${key} must be a finite number`)
  }
  return result
}
