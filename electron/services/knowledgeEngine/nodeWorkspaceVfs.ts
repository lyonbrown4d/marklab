import fs from 'node:fs/promises'
import path from 'node:path'

import { resolveWorkspacePath } from '@electron/services/workspace/path'
import type {
  FsEntry,
  FsPathMetadata,
  FsRootInfo,
  FsSnapshot,
  FsStateData,
} from '@electron/services/workspace/types'
import { readNodePathMetadata } from '@electron/services/workspace/workspaceNodePathMetadata'
import { listWorkspaceEntries as walkWorkspaceEntries } from '@electron/services/workspace/workspaceUtils'

export class NodeWorkspaceVfs {
  private rootPath: string

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath)
  }

  async open(rootPath: string): Promise<void> {
    this.rootPath = path.resolve(rootPath)
    await fs.mkdir(this.rootPath, { recursive: true })
  }

  async snapshot(root: FsRootInfo): Promise<FsSnapshot> {
    return { entries: await this.entries(), root }
  }

  entries(): Promise<FsEntry[]> {
    return walkWorkspaceEntries(this.state())
  }

  async read(relativePath: string): Promise<string> {
    return fs.readFile(this.resolve(relativePath), 'utf8')
  }

  async write(relativePath: string, content: string): Promise<{ changed: boolean; kind: 'file' }> {
    const absolutePath = this.resolve(relativePath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    let previous: string | null = null
    try {
      previous = await fs.readFile(absolutePath, 'utf8')
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    if (previous !== content) await fs.writeFile(absolutePath, content, 'utf8')
    return { changed: previous !== content, kind: 'file' }
  }

  async createFile(relativePath: string): Promise<{ changed: boolean; kind: 'file' }> {
    const absolutePath = this.resolve(relativePath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    try {
      const handle = await fs.open(absolutePath, 'wx')
      await handle.close()
      return { changed: true, kind: 'file' }
    } catch (error) {
      if (isExists(error)) return { changed: false, kind: 'file' }
      throw error
    }
  }

  async createDirectory(relativePath: string): Promise<{ changed: boolean; kind: 'folder' }> {
    const absolutePath = this.resolve(relativePath)
    try {
      await fs.mkdir(absolutePath)
      return { changed: true, kind: 'folder' }
    } catch (error) {
      if (isExists(error)) return { changed: false, kind: 'folder' }
      throw error
    }
  }

  async rename(from: string, to: string): Promise<{ changed: boolean; kind: 'file' | 'folder' }> {
    const source = this.resolve(from)
    const destination = this.resolve(to)
    const stat = await fs.stat(source)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.rename(source, destination)
    return { changed: source !== destination, kind: stat.isDirectory() ? 'folder' : 'file' }
  }

  async delete(relativePath: string): Promise<{ changed: boolean; kind: 'file' | 'folder' }> {
    const absolutePath = this.resolve(relativePath)
    let stat
    try {
      stat = await fs.stat(absolutePath)
    } catch (error) {
      if (isMissing(error)) return { changed: false, kind: 'file' }
      throw error
    }
    await fs.rm(absolutePath, { force: false, recursive: stat.isDirectory() })
    return { changed: true, kind: stat.isDirectory() ? 'folder' : 'file' }
  }

  async metadata(relativePath: string): Promise<FsPathMetadata> {
    return readNodePathMetadata(relativePath, this.resolve(relativePath))
  }

  private resolve(relativePath: string): string {
    return resolveWorkspacePath(this.state(), relativePath)
  }

  private state(): FsStateData {
    return {
      internalRoot: this.rootPath,
      rootKind: 'external',
      rootPath: this.rootPath,
      singleFile: null,
    }
  }
}

const isErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && 'code' in error && error.code === code

const isMissing = (error: unknown): boolean => isErrorCode(error, 'ENOENT')
const isExists = (error: unknown): boolean => isErrorCode(error, 'EEXIST')
