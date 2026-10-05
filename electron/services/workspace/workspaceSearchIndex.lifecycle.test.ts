import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  WorkspaceSearchIndex,
  type WorkspaceSearchIndexBackend,
} from '@electron/services/workspace/workspaceSearchIndex.js'
import type { FsSearchResult } from '@electron/services/workspace/types.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('WorkspaceSearchIndex lifecycle', () => {
  it('coalesces concurrent first opens for the same workspace', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-lifecycle-'))
    tempDirs.push(dir)
    const backend = new DelayedOpenBackend()
    const index = new WorkspaceSearchIndex(backend)
    const indexPath = path.join(dir, 'workspace')

    const firstOpen = index.open(indexPath, 'workspace-a')
    await backend.firstOpenStarted
    const secondOpen = index.open(indexPath, 'workspace-a')
    backend.releaseFirstOpen()
    await Promise.all([firstOpen, secondOpen])

    expect(backend.openCalls).toEqual(['workspace-a'])
    expect(backend.closeCalls).toEqual([])

    await index.close()
  })

  it('waits for a slow close before opening the next workspace', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-lifecycle-'))
    tempDirs.push(dir)
    const backend = new DelayedCloseBackend()
    backend.releaseFirstOpen()
    const index = new WorkspaceSearchIndex(backend)
    await index.open(path.join(dir, 'first'), 'workspace-a')
    const staleClose = index.close()
    await backend.firstCloseStarted

    const nextOpen = index.open(path.join(dir, 'second'), 'workspace-b')
    expect(backend.openCalls).toEqual(['workspace-a'])
    backend.releaseFirstClose()
    await Promise.all([staleClose, nextOpen])

    expect(backend.openCalls).toEqual(['workspace-a', 'workspace-b'])
    await index.close()
  })
})

class DelayedOpenBackend implements WorkspaceSearchIndexBackend {
  readonly closeCalls: string[] = []
  readonly openCalls: string[] = []
  private markFirstOpenStarted!: () => void
  private release!: () => void
  readonly firstOpenStarted = new Promise<void>((resolve) => {
    this.markFirstOpenStarted = resolve
  })
  private readonly firstOpenGate = new Promise<void>((resolve) => {
    this.release = resolve
  })

  releaseFirstOpen(): void {
    this.release()
  }

  async open(workspaceId: string): Promise<void> {
    this.openCalls.push(workspaceId)
    if (this.openCalls.length !== 1) return
    this.markFirstOpenStarted()
    await this.firstOpenGate
  }

  async close(workspaceId: string): Promise<void> {
    this.closeCalls.push(workspaceId)
  }

  async hasDocuments(): Promise<boolean> {
    return false
  }

  async rebuild(): Promise<void> {}
  async applySearchChanges(): Promise<void> {}
  async upsertDocument(): Promise<void> {}
  async removeDocument(): Promise<void> {}
  async removePathPrefix(): Promise<void> {}

  async search(): Promise<FsSearchResult[]> {
    return []
  }
}

class DelayedCloseBackend extends DelayedOpenBackend {
  private closeCount = 0
  private markFirstCloseStarted!: () => void
  private releaseCloseGate!: () => void
  readonly firstCloseStarted = new Promise<void>((resolve) => {
    this.markFirstCloseStarted = resolve
  })
  private readonly firstCloseGate = new Promise<void>((resolve) => {
    this.releaseCloseGate = resolve
  })

  releaseFirstClose(): void {
    this.releaseCloseGate()
  }

  override async close(workspaceId: string): Promise<void> {
    this.closeCalls.push(workspaceId)
    this.closeCount += 1
    if (this.closeCount !== 1) return
    this.markFirstCloseStarted()
    await this.firstCloseGate
  }
}
