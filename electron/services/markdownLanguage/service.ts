import type { WorkspaceService } from '@electron/services/workspace/workspaceService'
import type { FsMarkdownDiagnostic, FsWorkspaceIndex } from '@electron/services/workspace/types'
import { getMarkdownCodeActions } from '@electron/services/markdownLanguage/codeActions'
import { createMarkdownCompletions } from '@electron/services/markdownLanguage/completions'
import { getMarkdownDefinition } from '@electron/services/markdownLanguage/definitions'
import { getMarkdownDocumentSymbols } from '@electron/services/markdownLanguage/documentSymbols'
import { getMarkdownHover } from '@electron/services/markdownLanguage/hover'
import { renameMarkdownReferences } from '@electron/services/markdownLanguage/renames'
import { getMarkdownReferences } from '@electron/services/markdownLanguage/references'
import type {
  CompletionRequest,
  DiagnosticsRequest,
  DocumentSymbolsRequest,
  MarkdownLanguageCodeAction,
  MarkdownLanguageDefinition,
  MarkdownLanguageDocumentSymbol,
  MarkdownLanguageHover,
  MarkdownLanguageCompletionItem,
  MarkdownLanguageReference,
  MarkdownLanguageRenameResult,
  RenameRequest,
} from '@electron/services/markdownLanguage/types'

type WorkspaceIndexCacheEntry = {
  version: number
  promise: Promise<FsWorkspaceIndex>
  dispose: () => void
}

export class EmbeddedMarkdownLanguageService {
  private readonly indexCache = new WeakMap<WorkspaceService, WorkspaceIndexCacheEntry>()
  private readonly indexVersions = new WeakMap<WorkspaceService, number>()

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
    return workspace.analyzeMarkdownBuffer(request)
  }

  getDocumentSymbols(
    _workspace: WorkspaceService,
    value: unknown,
  ): MarkdownLanguageDocumentSymbol[] {
    const request = documentSymbolsRequest(value)
    return getMarkdownDocumentSymbols(request)
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

  async renameReferences(
    workspace: WorkspaceService,
    value: unknown,
  ): Promise<MarkdownLanguageRenameResult> {
    const request = renameRequest(value)
    return renameMarkdownReferences(workspace, request, () => this.workspaceIndex(workspace))
  }

  async getCodeActions(
    workspace: WorkspaceService,
    value: unknown,
  ): Promise<MarkdownLanguageCodeAction[]> {
    const request = completionRequest(value)
    return getMarkdownCodeActions(request, () => this.workspaceIndex(workspace))
  }

  async getHover(
    workspace: WorkspaceService,
    value: unknown,
  ): Promise<MarkdownLanguageHover | null> {
    const request = completionRequest(value)
    return getMarkdownHover(request, () => this.workspaceIndex(workspace))
  }

  private workspaceIndex(workspace: WorkspaceService): Promise<FsWorkspaceIndex> {
    const version = this.indexVersions.get(workspace) ?? 0
    const cached = this.indexCache.get(workspace)
    if (cached && cached.version === version) return cached.promise

    const entry = this.createWorkspaceIndexCacheEntry(workspace, version)
    this.indexCache.set(workspace, entry)
    return entry.promise
  }

  private createWorkspaceIndexCacheEntry(
    workspace: WorkspaceService,
    version: number,
  ): WorkspaceIndexCacheEntry {
    const unsubscribeSnapshot = workspace.onSnapshotChanged(() => {
      this.invalidateWorkspaceIndex(workspace)
    })
    const unsubscribeBuffer = workspace.onBufferStatus(() => {
      this.invalidateWorkspaceIndex(workspace)
    })
    const entry: WorkspaceIndexCacheEntry = {
      version,
      promise: workspace.workspaceIndex().catch((error) => {
        this.invalidateWorkspaceIndex(workspace, entry)
        throw error
      }),
      dispose: () => {
        unsubscribeSnapshot()
        unsubscribeBuffer()
      },
    }
    return entry
  }

  private invalidateWorkspaceIndex(
    workspace: WorkspaceService,
    expected?: WorkspaceIndexCacheEntry,
  ): void {
    const cached = this.indexCache.get(workspace)
    if (!cached || (expected && cached !== expected)) return
    cached.dispose()
    this.indexCache.delete(workspace)
    this.indexVersions.set(workspace, cached.version + 1)
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

const documentSymbolsRequest = (value: unknown): DocumentSymbolsRequest => {
  const payload = objectArg(value)
  return {
    path: nullableStringArg(payload, 'path'),
    content: stringArg(payload, 'content'),
  }
}

const renameRequest = (value: unknown): RenameRequest => {
  const request = completionRequest(value)
  const payload = objectArg(value)
  return {
    ...request,
    newName: stringArg(payload, 'newName'),
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
