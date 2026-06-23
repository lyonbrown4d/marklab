import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import type { WorkspaceSearchIndexBackend } from '@electron/services/workspace/workspaceSearchIndex.js'
import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'

export class KnowledgeEngineWorkspaceSearchBackend implements WorkspaceSearchIndexBackend {
  constructor(private readonly knowledgeEngine: KnowledgeEngineService) {}

  async open(workspaceId: string, indexPath: string): Promise<void> {
    await this.knowledgeEngine.openWorkspace(workspaceId, indexPath)
  }

  async close(workspaceId: string): Promise<void> {
    await this.knowledgeEngine.closeWorkspace(workspaceId)
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    return this.knowledgeEngine.hasDocuments(workspaceId)
  }

  async rebuild(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    await this.knowledgeEngine.rebuildIndex(workspaceId, documents)
  }

  async upsertDocument(workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    await this.knowledgeEngine.upsertDocument(workspaceId, document)
  }

  async removeDocument(workspaceId: string, path: string): Promise<void> {
    await this.knowledgeEngine.removeDocument(workspaceId, path)
  }

  async removePathPrefix(workspaceId: string, prefix: string): Promise<void> {
    await this.knowledgeEngine.removePathPrefix(workspaceId, prefix)
  }

  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    return this.knowledgeEngine.search(workspaceId, query, limit)
  }
}
