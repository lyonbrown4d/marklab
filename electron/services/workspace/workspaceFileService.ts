import fs from 'node:fs'
import path from 'node:path'

import { rewriteMarkdownFileReferencesForRename } from '@electron/services/markdownLanguage/fileRenames.js'
import { isMarkdownPath, workspaceRootForAssets } from '@electron/services/workspace/path.js'
import type { FsWorkspaceIndex } from '@electron/services/workspace/types.js'
import type {
  FsBufferStatus,
  FsPathMetadata,
  FsRootInfo,
} from '@electron/services/workspace/types.js'
import { WorkspaceBase } from '@electron/services/workspace/workspaceBase.js'
import {
  ensureDefaultFile,
  isPathInsideOrEqual,
  pathExists,
  stringArg,
} from '@electron/services/workspace/workspaceUtils.js'

export class WorkspaceFileService extends WorkspaceBase {
  async snapshot() {
    return { root: this.rootInfo(), entries: await this.listEntries() }
  }

  terminalCwd(): string {
    if (this.state.rootKind === 'single' && this.state.singleFile) {
      return path.dirname(this.state.singleFile)
    }
    return this.state.rootPath
  }

  isAssetPathAllowed(value: string): boolean {
    if (typeof value !== 'string' || !value || value.includes('\0')) return false
    const resolved = path.resolve(value)
    return isPathInsideOrEqual(workspaceRootForAssets(this.state), resolved)
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
    if (!isMarkdownPath(filePath)) throw new Error('Selected file is not a Markdown file')

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

  getBufferStatus(value: unknown): FsBufferStatus | null {
    const relativePath = stringArg(value, 'path')
    this.resolve(relativePath)
    return this.buffers.getStatus(relativePath)
  }

  async createFile(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const relativePath = stringArg(value, 'path')
    const absolutePath = this.resolve(relativePath)
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true })
    if (!(await pathExists(absolutePath))) {
      await fs.promises.writeFile(absolutePath, '')
      this.buffers.setCleanFile(relativePath, '')
    } else {
      this.buffers.delete(relativePath)
    }
    this.scheduleSnapshotChanged({ restartWatcher: true })
    this.logger.info('file created', { path: relativePath })
  }

  async createDir(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const absolutePath = this.resolve(stringArg(value, 'path'))
    await fs.promises.mkdir(absolutePath, { recursive: true })
    this.scheduleSnapshotChanged({ restartWatcher: true })
    this.logger.info('folder created', { path: stringArg(value, 'path') })
  }

  async renamePath(value: unknown): Promise<void> {
    this.ensureWorkspaceMode()
    const from = stringArg(value, 'from')
    const to = stringArg(value, 'to')
    const target = this.resolve(to)
    const workspaceIndex = await this.getWorkspaceIndexForRename()
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    await fs.promises.rename(this.resolve(from), target)
    this.buffers.rename(from, to)
    if (workspaceIndex) {
      const rewrite = await rewriteMarkdownFileReferencesForRename({
        host: this,
        workspaceIndex,
        fromPath: from,
        toPath: to,
      })
      if (rewrite.appliedEdits > 0) {
        this.logger.info('markdown rename references updated', {
          from,
          to,
          appliedEdits: rewrite.appliedEdits,
          touchedFiles: rewrite.touchedFiles.length,
        })
      }
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
    const absolutePath = this.resolve(relativePath)
    const stat = await fs.promises.stat(absolutePath)
    if (stat.isDirectory()) {
      await fs.promises.rm(absolutePath, { recursive: true, force: false })
    } else {
      await fs.promises.unlink(absolutePath)
    }
    this.buffers.deleteUnder(relativePath)
    this.scheduleSnapshotChanged({ restartWatcher: true })
    this.logger.info('path deleted', {
      path: relativePath,
      kind: stat.isDirectory() ? 'folder' : 'file',
    })
  }

  async pathMetadata(value: unknown): Promise<FsPathMetadata> {
    const relativePath = stringArg(value, 'path')
    const absolutePath = this.resolve(relativePath)
    const stat = await fs.promises.stat(absolutePath)
    return {
      path: relativePath,
      absolute_path: absolutePath,
      kind: stat.isDirectory() ? 'folder' : 'file',
      size_bytes: stat.size,
      modified_ms: stat.mtimeMs,
      readonly: (stat.mode & 0o200) === 0,
    }
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
