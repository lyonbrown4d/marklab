import fs from 'node:fs'
import path from 'node:path'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type {
  FsBufferStatus,
  FsPathMetadataResult,
  FsRootInfo,
  WorkspaceRootSwitchOptions,
  FsStateData,
} from '@electron/services/workspace/types'
import { WorkspaceMutationService } from '@electron/services/workspace/workspaceMutationService'
import {
  getOptionalWorkspaceIndex,
  rewriteWorkspaceReferencesForRename,
} from '@electron/services/workspace/workspaceFileRenameReferences'
import type { WorkspaceBufferWriteFile } from '@electron/services/workspace/workspaceBuffers'
import { deleteWorkspacePathWithNode } from '@electron/services/workspace/workspaceNodeFileMutations'
import { workspaceTerminalCwd } from '@electron/services/workspace/workspaceAssetAccess'
import { toPathMetadataResult } from '@electron/services/workspace/workspaceNodePathMetadata'
import { readWorkspacePathMetadata } from '@electron/services/workspace/workspacePathMetadata'
import { createWorkspaceFileEntry } from '@electron/services/workspace/workspaceCreateFile'
import {
  selectSingleFileWorkspace,
  selectWorkspaceRoot,
} from '@electron/services/workspace/workspaceRootSelection'
import {
  trySidecarPathMutation,
  tryPrewarmSidecarFileAccess,
  trySidecarWriteFile,
} from '@electron/services/workspace/workspaceSidecarFileBridge'
import { stringArg } from '@electron/services/workspace/workspaceUtils'
import { readWorkspaceTextPreview } from '@electron/services/workspace/workspaceTextPreview'
import type { WorkspaceTextPreview } from '@/types/workspaceTextPreview'
import { WorkspaceAccessPrewarmer } from '@electron/services/workspace/workspaceAccessPrewarmer'
import { createWorkspaceBufferUpdateHandler } from '@electron/services/workspace/workspaceBufferUpdateHandler'
import { openWorkspacePath } from '@electron/services/workspace/workspaceSystemPath'
import { WorkspaceFileReader } from '@electron/services/workspace/workspaceFileReader'
import { WorkspaceRootTransitionGate } from '@electron/services/workspace/workspaceRootTransitionGate'
import { runWorkspaceRootCommit } from '@electron/services/workspace/workspaceRootCommit'

export class WorkspaceFileService extends WorkspaceMutationService {
  private readonly rootTransitions = new WorkspaceRootTransitionGate()
  private workspaceSessionGeneration = 0
  private readonly accessPrewarmer: WorkspaceAccessPrewarmer
  private readonly fileReader: WorkspaceFileReader
  readonly applyBufferUpdate = createWorkspaceBufferUpdateHandler(
    this.buffers,
    (path) => void this.resolve(path),
    (path, content) => this.updateBuffer({ path, content }),
    () => this.workspaceSessionGeneration,
  )

  constructor(
    app: ConstructorParameters<typeof WorkspaceMutationService>[0],
    shell: ConstructorParameters<typeof WorkspaceMutationService>[1],
    logger: ConstructorParameters<typeof WorkspaceMutationService>[2],
    private readonly localHistory: LocalHistoryServiceContract,
    private readonly knowledgeEngineService?: KnowledgeEngineService,
  ) {
    super(app, shell, logger)
    this.fileReader = new WorkspaceFileReader({
      buffers: this.buffers,
      getState: () => this.state,
      knowledgeEngineService: this.knowledgeEngineService,
      logger: this.logger,
      resolvePath: (relativePath) => this.resolve(relativePath),
    })
    this.accessPrewarmer = new WorkspaceAccessPrewarmer({
      logger: this.logger,
      prepare: async () => {
        await Promise.all([
          this.pathSnapshots.get(),
          tryPrewarmSidecarFileAccess({
            knowledgeEngineService: this.knowledgeEngineService,
            logger: this.logger,
            state: this.state,
          }),
        ])
      },
      rootKind: () => this.state.rootKind,
    })
    this.accessPrewarmer.schedule()
  }

  override dispose(): void {
    this.accessPrewarmer.dispose()
    super.dispose()
  }

  terminalCwd = () => workspaceTerminalCwd(this.state)

  async setRoot(value: unknown, options: WorkspaceRootSwitchOptions = {}): Promise<FsRootInfo> {
    return this.switchRoot(() => selectWorkspaceRoot(this.state, value), options)
  }

  async setSingleFile(
    value: unknown,
    options: WorkspaceRootSwitchOptions = {},
  ): Promise<FsRootInfo> {
    return this.switchRoot(() => selectSingleFileWorkspace(this.state, value), options)
  }

  private async switchRoot(
    select: () => Promise<FsStateData | null>,
    options: WorkspaceRootSwitchOptions,
  ): Promise<FsRootInfo> {
    return this.rootTransitions.run(options, async () => {
      const nextState = await select()
      options.signal?.throwIfAborted()
      return nextState ? this.commitWorkspaceState(nextState, options) : this.rootInfo()
    })
  }

  readonly openFile = (value: unknown): Promise<string> =>
    this.fileReader.open(stringArg(value, 'path'))

  override async readFile(value: unknown): Promise<string> {
    return this.fileReader.open(stringArg(value, 'path'))
  }

  protected override readonly readFileForAnalysis = (relativePath: string): Promise<string> =>
    this.fileReader.readForAnalysis(relativePath)

  readTextPreview(value: unknown): Promise<WorkspaceTextPreview> {
    return readWorkspaceTextPreview(this.state, value)
  }

  updateBuffer(value: unknown): FsBufferStatus {
    if (this.rootTransitions.blocksMutations) {
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

  getBufferStatus(value: unknown): (FsBufferStatus & { session_generation: number }) | null {
    const relativePath = stringArg(value, 'path')
    this.resolve(relativePath)
    const status = this.buffers.getStatus(relativePath)
    return status ? { ...status, session_generation: this.workspaceSessionGeneration } : null
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
    this.pathSnapshots.invalidate()
    this.tree.invalidateQueries()
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
    this.pathSnapshots.invalidate()
    this.tree.invalidateQueries()
    this.scheduleSnapshotChanged({ restartWatcher: true })
    this.logger.info('folder created', { path: relativePath })
  }
  async renamePath(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const from = stringArg(value, 'from')
    const to = stringArg(value, 'to')
    const workspaceIndex = await getOptionalWorkspaceIndex(this)
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
    this.tree.recordRename(from, to)
    this.pathSnapshots.invalidate()
    this.tree.invalidateQueries()
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
    this.pathSnapshots.invalidate()
    this.tree.invalidateQueries()
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

  openPathInSystem = (value: unknown) =>
    openWorkspacePath(this.state, this.shell, this.logger, value)

  private async commitWorkspaceState(
    nextState: FsStateData,
    options: WorkspaceRootSwitchOptions,
  ): Promise<FsRootInfo> {
    return runWorkspaceRootCommit({
      buffers: this.buffers,
      options,
      commit: () => {
        this.buffers.clear()
        this.workspaceSessionGeneration += 1
        this.state = nextState
        this.tree.commitRoot()
        this.pathSnapshots.invalidate()
        this.watcher.restart()
        this.accessPrewarmer.schedule()
        this.scheduleSnapshotChanged()
        this.logger.info('workspace root changed', {
          rootKind: nextState.rootKind,
          rootPath: nextState.rootPath,
        })
        return this.rootInfo()
      },
    })
  }
}
