import type { FsEntry } from '@electron/services/workspace/types'
import {
  loadWorkspaceDocuments,
  type WorkspaceDocument,
} from '@electron/services/workspace/workspaceDocumentLoader'
import type {
  WorkspaceKnownPaths,
  WorkspacePathSnapshot,
} from '@electron/services/workspace/workspaceUtils'

const WORKSPACE_DOCUMENT_READ_BATCH_SIZE = 8

export class WorkspaceDocumentCatalog {
  constructor(
    private readonly getSnapshot: () => Promise<WorkspacePathSnapshot>,
    private readonly readFile: (path: string) => Promise<string>,
  ) {}

  async documents(replacePath?: string, replaceContent?: string): Promise<WorkspaceDocument[]> {
    return this.load((await this.getSnapshot()).entries, replacePath, replaceContent)
  }

  async documentsAndKnownPaths(
    replacePath?: string,
    replaceContent?: string,
  ): Promise<{ documents: WorkspaceDocument[]; knownPaths: WorkspaceKnownPaths }> {
    const snapshot = await this.getSnapshot()
    return {
      documents: await this.load(snapshot.entries, replacePath, replaceContent),
      knownPaths: snapshot.knownPaths,
    }
  }

  async documentsForPaths(paths: string[]): Promise<WorkspaceDocument[]> {
    const selectedPaths = new Set(paths)
    const entries = (await this.getSnapshot()).entries.filter((entry) =>
      selectedPaths.has(entry.path),
    )
    return this.load(entries)
  }

  private load(
    entries: FsEntry[],
    replacePath?: string,
    replaceContent?: string,
  ): Promise<WorkspaceDocument[]> {
    return loadWorkspaceDocuments({
      batchSize: WORKSPACE_DOCUMENT_READ_BATCH_SIZE,
      entries,
      readFile: this.readFile,
      replaceContent,
      replacePath,
    })
  }
}
