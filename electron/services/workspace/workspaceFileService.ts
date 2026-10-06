import fs from 'node:fs'
import path from 'node:path'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type {
  FsBufferStatus,
  FsEntry,
  FsPathMetadataResult,
  FsRootInfo,
  FsSnapshot,
  FsStateData,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types'
import { WorkspaceMutationService } from '@electron/services/workspace/workspaceMutationService'
import { rewriteWorkspaceReferencesForRename } from '@electron/services/workspace/workspaceFileRenameReferences'
import type { WorkspaceBufferWriteFile } from '@electron/services/workspace/workspaceBuffers'
import { deleteWorkspacePathWithNode } from '@electron/services/workspace/workspaceNodeFileMutations'
import { workspaceTerminalCwd } from '@electron/services/workspace/workspaceAssetAccess'
import { toPathMetadataResult } from '@electron/services/workspace/workspaceNodePathMetadata'
import { readWorkspacePathMetadata } from '@electron/services/workspace/workspacePathMetadata'
import { createWorkspaceFileEntry } from '@electron/services/workspace/workspaceCreateFile'
import {
  selectWorkspaceRoot,
  selectSingleFileWorkspace,
} from '@electron/services/workspace/workspaceRootSelection'
import {
  trySidecarPathMutation,
  trySidecarReadFile,
  trySidecarSnapshot,
  trySidecarWriteFile,
} from '@electron/services/workspace/workspaceSidecarFileBridge'
import { stringArg } from '@electron/services/workspace/workspaceUtils'
import { readWorkspaceTextPreview } from '@electron/services/workspace/workspaceTextPreview'
import type { WorkspaceTextPreview } from '@/types/workspaceTextPreview'

export class WorkspaceFileService extends WorkspaceMutationService {
  private rootTransitionInProgress = false

  constructor(
    app: ConstructorParameters<typeof WorkspaceMutationService>[0],
    shell: ConstructorParameters<typeof WorkspaceMutationService>[1],
    logger: ConstructorParameters<typeof WorkspaceMutationService>[2],
    private readonly localHistory: LocalHistoryServiceContract,
    private readonly knowledgeEngineService?: KnowledgeEngineService,
  ) {
    super(app, shell, logger)
  }

  async snapshot(): Promise<FsSnapshot> {
    const sidecarSnapshot = await trySidecarSnapshot({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      root: this.rootInfo(),
      state: this.state,
    })
    if (sidecarSnapshot) return sidecarSnapshot
    return { root: this.rootInfo(), entries: await super.listEntries() }
  }

  protected override async listEntries(): Promise<FsEntry[]> {
    const sidecarSnapshot = await trySidecarSnapshot({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      root: this.rootInfo(),
      state: this.state,
    })
    if (sidecarSnapshot) return sidecarSnapshot.entries
    return super.listEntries()
  }

  terminalCwd(): string {
    return workspaceTerminalCwd(this.state)
  }

  async setRoot(value: unknown): Promise<FsRootInfo> {
    this.beginRootTransition()
    try {
      const nextState = await selectWorkspaceRoot(this.state, value)
      return nextState ? this.commitWorkspaceState(nextState) : this.rootInfo()
    } finally {
      this.rootTransitionInProgress = false
    }
  }

  async setSingleFile(value: unknown): Promise<FsRootInfo> {
    this.beginRootTransition()
    try {
      const nextState = await selectSingleFileWorkspace(this.state, value)
      return nextState ? this.commitWorkspaceState(nextState) : this.rootInfo()
    } finally {
      this.rootTransitionInProgress = false
    }
  }

  async openFile(value: unknown): Promise<string> {
    return this.readFile(value)
  }

  async readFile(value: unknown): Promise<string> {
    const relativePath = stringArg(value, 'path')
    const absolutePath = this.resolve(relativePath)
    const cached = this.buffers.readCached(relativePath)
    if (cached != null) return cached
    const sidecarContent = await trySidecarReadFile({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      path: relativePath,
      state: this.state,
    })
    if (sidecarContent != null) {
      return this.buffers.cacheCleanFile(relativePath, sidecarContent)
    }
    const content = await fs.promises.readFile(absolutePath, 'utf8')
    return this.buffers.cacheCleanFile(relativePath, content)
  }

  readTextPreview(value: unknown): Promise<WorkspaceTextPreview> {
    return readWorkspaceTextPreview(this.state, value)
  }

  updateBuffer(value: unknown): FsBufferStatus {
    if (this.rootTransitionInProgress) {
      throw new Error('Workspace is switching; retry the buffer update')
    }
    const relativePath = stringArg(value, 'path')
    const content = stringArg(value, 'content')
    const absolutePath = this.resolve(relativePath)
    return this.buffers.update(relativePath, content, {
      absolutePath,
      state: { ...this.state },
    })
  }

  writeFile(value: unknown): void {
    this.updateBuffer(value)
  }

  flushBuffers(): Promise<void> {
    return this.buffers.flush()
  }

  protected override async writeBufferedFile(
    args: Parameters<WorkspaceBufferWriteFile>[0],
  ): Promise<void> {
    if (!args.state) {
      throw new Error(`Missing workspace session for buffered write: ${args.relativePath}`)
    }
    const sidecarWritten = await trySidecarWriteFile({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      path: args.relativePath,
      state: args.state,
      content: args.content,
      beforeWrite: () => this.watcher.markOwnWrite(args.absolutePath),
    })
    if (!sidecarWritten) await args.writeWithNode()
    try {
      await this.localHistory.capture(
        { kind: args.state.rootKind, path: args.state.rootPath },
        args.relativePath,
        args.content,
      )
    } catch (error) {
      this.logger.warn('local history snapshot failed', {
        error,
        path: args.relativePath,
      })
    }
  }

  getBufferStatus(value: unknown): FsBufferStatus | null {
    const relativePath = stringArg(value, 'path')
    this.resolve(relativePath)
    return this.buffers.getStatus(relativePath)
  }

  async createFile(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    await createWorkspaceFileEntry({
      hasDirtyBuffer: (relativePath) => this.buffers.getStatus(relativePath)?.dirty === true,
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      resolveRelativePath: (relativePath) => this.resolve(relativePath),
      scheduleSnapshotChanged: (options) => this.scheduleSnapshotChanged(options),
      setCleanFile: (relativePath, content) => this.buffers.setCleanFile(relativePath, content),
      state: this.state,
      value,
    })
  }
  async createDir(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const relativePath = stringArg(value, 'path')
    const sidecarMutation = await trySidecarPathMutation({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      mutate: (service, runtime) =>
        service.createWorkspaceDirectory(runtime.workspaceId, runtime.workspaceRoot, relativePath),
      path: relativePath,
      state: this.state,
    })
    if (!sidecarMutation) {
      await fs.promises.mkdir(this.resolve(relativePath), { recursive: true })
    }
    this.scheduleSnapshotChanged({ restartWatcher: true })
    this.logger.info('folder created', { path: relativePath })
  }
  async renamePath(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const from = stringArg(value, 'from')
    const to = stringArg(value, 'to')
    const workspaceIndex = await this.getWorkspaceIndexForRename()
    const sidecarMutation = await trySidecarPathMutation({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      mutate: (service, runtime) =>
        service.renameWorkspacePath(runtime.workspaceId, runtime.workspaceRoot, from, to),
      path: from,
      state: this.state,
    })
    if (!sidecarMutation) {
      const target = this.resolve(to)
      await fs.promises.mkdir(path.dirname(target), { recursive: true })
      await fs.promises.rename(this.resolve(from), target)
    }
    this.buffers.rename(from, to)
    if (workspaceIndex) {
      await rewriteWorkspaceReferencesForRename({
        host: this,
        logger: this.logger,
        workspaceIndex,
        from,
        to,
      })
    }
    this.scheduleSnapshotChanged({ restartWatcher: true })
    this.logger.info('path renamed', { from, to })
  }
  async movePath(value: unknown): Promise<void> {
    await this.renamePath(value)
  }

  async deletePath(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const relativePath = stringArg(value, 'path')
    const sidecarMutation = await trySidecarPathMutation({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      mutate: (service, runtime) =>
        service.deleteWorkspacePath(runtime.workspaceId, runtime.workspaceRoot, relativePath),
      path: relativePath,
      state: this.state,
    })
    const kind =
      sidecarMutation?.kind ?? (await deleteWorkspacePathWithNode(this.resolve(relativePath)))
    this.buffers.deleteUnder(relativePath)
    this.scheduleSnapshotChanged({ restartWatcher: true })
    this.logger.info('path deleted', { path: relativePath, kind })
  }
  async pathMetadata(value: unknown): Promise<FsPathMetadataResult> {
    const relativePath = stringArg(value, 'path')
    const metadata = await readWorkspacePathMetadata({
      absolutePath: this.resolve(relativePath),
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      path: relativePath,
      state: this.state,
    })
    return toPathMetadataResult(metadata)
  }

  async openPathInSystem(value: unknown): Promise<void> {
    const relativePath = stringArg(value, 'path')
    const error = await this.shell.openPath(this.resolve(relativePath))
    if (error) this.logger.warn('open path in system failed', { path: relativePath, error })
    if (error) throw new Error(`Failed to open path: ${error}`)
    this.logger.info('path opened in system', { path: relativePath })
  }

  private beginRootTransition(): void {
    if (this.rootTransitionInProgress) {
      throw new Error('Another workspace switch is already in progress')
    }
    this.rootTransitionInProgress = true
  }

  private async commitWorkspaceState(nextState: FsStateData): Promise<FsRootInfo> {
    await this.buffers.flush()
    const dirtyCount = this.buffers.getBackgroundDirtyCount()
    if (dirtyCount > 0) {
      throw new Error(`Workspace switch blocked by ${dirtyCount} unsaved buffer(s)`)
    }

    this.buffers.clear()
    this.state = nextState
    this.watcher.restart()
    this.scheduleSnapshotChanged()
    this.logger.info('workspace root changed', {
      rootKind: nextState.rootKind,
      rootPath: nextState.rootPath,
    })
    return this.rootInfo()
  }

  private async getWorkspaceIndexForRename(): Promise<FsWorkspaceIndex | null> {
    const service = this as unknown as {
      workspaceIndex?: () => Promise<FsWorkspaceIndex>
    }
    return service.workspaceIndex ? service.workspaceIndex().catch(() => null) : null
  }
}
