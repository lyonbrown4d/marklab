import fs from 'node:fs'
import path from 'node:path'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import { isWorkspaceDocumentPath } from '@electron/services/workspace/path.js'
import type {
  FsBufferStatus,
  FsEntry,
  FsPathMetadata,
  FsRootInfo,
  FsSnapshot,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'
import { WorkspaceBase } from '@electron/services/workspace/workspaceBase.js'
import { rewriteWorkspaceReferencesForRename } from '@electron/services/workspace/workspaceFileRenameReferences.js'
import type { WorkspaceBufferWriteFile } from '@electron/services/workspace/workspaceBuffers.js'
import { deleteWorkspacePathWithNode } from '@electron/services/workspace/workspaceNodeFileMutations.js'
import {
  workspaceTerminalCwd,
  isWorkspaceAssetPathAllowed,
} from '@electron/services/workspace/workspaceAssetAccess.js'
import { readWorkspaceFileServiceAssetBytes } from '@electron/services/workspace/workspaceFileServiceAssetBytes.js'
import { readWorkspacePathMetadata } from '@electron/services/workspace/workspacePathMetadata.js'
import { createWorkspaceFileEntry } from '@electron/services/workspace/workspaceCreateFile.js'
import {
  trySidecarPathMutation,
  trySidecarReadFile,
  trySidecarSnapshot,
  trySidecarWriteFile,
} from '@electron/services/workspace/workspaceSidecarFileBridge.js'
import { ensureDefaultFile, stringArg } from '@electron/services/workspace/workspaceUtils.js'

export class WorkspaceFileService extends WorkspaceBase {
  constructor(
    app: ConstructorParameters<typeof WorkspaceBase>[0],
    shell: ConstructorParameters<typeof WorkspaceBase>[1],
    logger: ConstructorParameters<typeof WorkspaceBase>[2],
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

  isAssetPathAllowed(value: string): boolean {
    return isWorkspaceAssetPathAllowed(this.state, value)
  }
  async setRoot(value: unknown): Promise<FsRootInfo> {
    const rootPath = typeof value === 'object' && value && 'path' in value ? value.path : value
    if (rootPath != null && typeof rootPath !== 'string') {
      throw new Error('fs_set_root requires path to be a string or null')
    }

    if (rootPath) {
      const stat = await fs.promises.stat(rootPath).catch(() => null)
      if (!stat?.isDirectory()) throw new Error('Selected path is not a directory')
      this.state = {
        ...this.state,
        rootKind: 'external',
        rootPath: path.resolve(rootPath),
        singleFile: null,
      }
    } else {
      fs.mkdirSync(this.state.internalRoot, { recursive: true })
      ensureDefaultFile(this.state.internalRoot)
      this.state = {
        ...this.state,
        rootKind: 'internal',
        rootPath: this.state.internalRoot,
        singleFile: null,
      }
    }

    this.buffers.clear()
    this.watcher.restart()
    this.scheduleSnapshotChanged()
    this.logger.info('workspace root changed', {
      rootKind: this.state.rootKind,
      rootPath: this.state.rootPath,
    })
    return this.rootInfo()
  }

  async setSingleFile(value: unknown): Promise<FsRootInfo> {
    const filePath = stringArg(value, 'path')
    const stat = await fs.promises.stat(filePath).catch(() => null)
    if (!stat?.isFile()) throw new Error('Selected path is not a file')
    if (!isWorkspaceDocumentPath(filePath)) {
      throw new Error('Selected file is not supported by this workspace')
    }

    const resolved = path.resolve(filePath)
    this.state = {
      ...this.state,
      rootKind: 'single',
      rootPath: resolved,
      singleFile: resolved,
    }
    this.buffers.clear()
    this.watcher.restart()
    this.scheduleSnapshotChanged()
    this.logger.info('single file workspace opened', { path: path.basename(resolved) })
    return this.rootInfo()
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
    if (sidecarContent != null) return sidecarContent
    return fs.promises.readFile(absolutePath, 'utf8')
  }

  updateBuffer(value: unknown): FsBufferStatus {
    const relativePath = stringArg(value, 'path')
    const content = stringArg(value, 'content')
    this.resolve(relativePath)
    return this.buffers.update(relativePath, content)
  }

  writeFile(value: unknown): void {
    this.updateBuffer(value)
  }

  flushBuffers(): Promise<number> {
    return this.buffers.flush()
  }

  protected override async writeBufferedFile(
    args: Parameters<WorkspaceBufferWriteFile>[0],
  ): Promise<void> {
    const sidecarWritten = await trySidecarWriteFile({
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      path: args.relativePath,
      state: this.state,
      content: args.content,
      beforeWrite: () => this.watcher.markOwnWrite(args.absolutePath),
    })
    if (sidecarWritten) return
    await args.writeWithNode()
  }

  getBufferStatus(value: unknown): FsBufferStatus | null {
    const relativePath = stringArg(value, 'path')
    this.resolve(relativePath)
    return this.buffers.getStatus(relativePath)
  }

  async createFile(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    await createWorkspaceFileEntry({
      deleteBuffer: (relativePath) => this.buffers.delete(relativePath),
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
  pathMetadata(value: unknown): Promise<FsPathMetadata> {
    const relativePath = stringArg(value, 'path')
    return readWorkspacePathMetadata({
      absolutePath: this.resolve(relativePath),
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      path: relativePath,
      state: this.state,
    })
  }

  readAssetBytes(value: unknown) {
    return readWorkspaceFileServiceAssetBytes(
      {
        isAssetPathAllowed: (path) => this.isAssetPathAllowed(path),
        resolveRelativePath: (path) => this.resolve(path),
      },
      value,
    )
  }

  async openPathInSystem(value: unknown): Promise<void> {
    const metadata = await this.pathMetadata(value)
    const error = await this.shell.openPath(metadata.absolute_path)
    if (error) this.logger.warn('open path in system failed', { path: metadata.path, error })
    if (error) throw new Error(`Failed to open path: ${error}`)
    this.logger.info('path opened in system', { path: metadata.path })
  }

  private async getWorkspaceIndexForRename(): Promise<FsWorkspaceIndex | null> {
    const service = this as unknown as {
      workspaceIndex?: () => Promise<FsWorkspaceIndex>
    }
    return service.workspaceIndex ? service.workspaceIndex().catch(() => null) : null
  }
}
