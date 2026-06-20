import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'
import {
  loadNativeSearchModule,
  normalizeNativeSearchResult,
  type NativeSearchIndex,
  type NativeSearchModule,
} from '@electron/services/workspace/workspaceNativeSearchModule.js'

type NativeSearchModuleLoader = () => NativeSearchModule | null

export class WorkspaceNativeSearchBackend {
  private index: NativeSearchIndex | null = null

  constructor(private readonly loadModule: NativeSearchModuleLoader = loadNativeSearchModule) {}

  open(indexPath: string): boolean {
    const nativeModule = this.loadModule()
    if (!nativeModule) return false

    const index = new nativeModule.NativeSearchIndex()
    index.open(indexPath)
    this.index = index
    return true
  }

  close(): void {
    const index = this.index
    this.index = null
    if (!index) return
    index.close()
  }

  hasDocuments(): boolean | null {
    return this.withIndex((index) => index.hasDocuments())
  }

  rebuild(documents: WorkspaceSearchDocument[]): boolean {
    return this.withIndex((index) => index.rebuild(documents)) !== null
  }

  upsertDocument(document: WorkspaceSearchDocument): boolean {
    return this.withIndex((index) => index.upsertDocument(document)) !== null
  }

  removeDocument(pathValue: string): boolean {
    return this.withIndex((index) => index.removeDocument(pathValue)) !== null
  }

  removePathPrefix(prefix: string): boolean {
    return this.withIndex((index) => index.removePathPrefix(prefix)) !== null
  }

  search(query: string, limit: number): FsSearchResult[] | null {
    return this.withIndex((index) =>
      index
        .search(query, limit)
        .map(normalizeNativeSearchResult)
        .filter((result): result is FsSearchResult => Boolean(result)),
    )
  }

  private withIndex<Result>(operation: (index: NativeSearchIndex) => Result): Result | null {
    if (!this.index) return null
    return operation(this.index)
  }
}
