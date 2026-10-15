import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Shell } from 'electron'
import type { GitOpenFileResult } from '@/types/gitPreview'
import type { GitFilePreviewSource } from '@electron/services/git/filePreview'
import { writeGitBlobFile } from '@electron/services/git/blobFile'
import { WorkspaceAssetCapabilities } from '@electron/services/workspace/workspaceAssetCapabilities'
import { noopLogger, type Logger } from '@electron/services/logger'

// A window owns these immutable versions. Workspace switches revoke their opaque URLs.
export class WorkspaceGitPreviewFiles {
  private disposed = false
  private directory: Promise<string> | null = null
  private capabilities: WorkspaceAssetCapabilities | null = null
  private readonly files = new Map<string, Promise<string>>()
  private readonly abort = new AbortController()
  private readonly lastUsed = new Map<string, number>()
  private readonly tokenKeys = new Map<string, string>()
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly shell: Pick<Shell, 'openPath'>,
    private readonly logger: Pick<Logger, 'warn'> = noopLogger,
  ) {}

  async open(
    source: Extract<GitFilePreviewSource, { kind: 'blob' }>,
    action: 'preview' | 'system',
  ): Promise<GitOpenFileResult> {
    await this.cleanupIdle()
    const directory = await this.root()
    const key = `${source.hash}\0${source.path}`
    this.touch(key)
    let pending = this.files.get(key)
    if (!pending) {
      pending = (async () => {
        const relative = `${randomUUID()}/${path.basename(source.path)}`
        const absolute = path.join(directory, relative)
        await fs.mkdir(path.dirname(absolute), { mode: 0o700 })
        await writeGitBlobFile(source.root, source.hash, absolute, this.abort.signal)
        return relative
      })()
      this.files.set(key, pending)
      void pending.catch(() => {
        this.files.delete(key)
        this.lastUsed.delete(key)
      })
    }
    const relative = await pending
    if (this.disposed) throw new Error('Git file preview workspace was closed')
    if (action === 'system') {
      const error = await this.shell.openPath(path.join(directory, relative))
      if (error) throw new Error(`Unable to open file: ${error}`)
      return { kind: 'opened' }
    }
    const capability = await this.capabilities!.issue({ path: relative })
    this.tokenKeys.set(new URL(capability.url).pathname.split('/').pop()!, key)
    return {
      kind: 'preview',
      path: source.path,
      label: source.label,
      readonly: true,
      snapshot: true,
      url: capability.url,
    }
  }

  async resolveToken(token: string) {
    const asset = await (this.capabilities?.resolveToken(token) ?? Promise.resolve(null))
    const key = this.tokenKeys.get(token)
    if (asset && key) this.touch(key)
    return asset
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.abort.abort()
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer)
    this.cleanupTimer = null
    this.lastUsed.clear()
    this.tokenKeys.clear()
    this.capabilities?.dispose()
    const pending = [...this.files.values()]
    this.files.clear()
    await Promise.allSettled(pending)
    const directory = await this.directory
    if (directory) await fs.rm(directory, { recursive: true, force: true })
  }

  private root(): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('Git file preview workspace was closed'))
    this.directory ??= fs
      .mkdtemp(path.join(os.tmpdir(), 'marklab-git-preview-'))
      .then((directory) => {
        if (!this.disposed) {
          this.capabilities = new WorkspaceAssetCapabilities(() => ({
            rootKind: 'external',
            rootPath: directory,
            internalRoot: directory,
            singleFile: null,
          }))
        }
        return directory
      })
    return this.directory.then((directory) => {
      if (this.disposed) throw new Error('Git file preview workspace was closed')
      return directory
    })
  }

  private touch(key: string): void {
    this.lastUsed.set(key, Date.now())
    this.scheduleCleanup()
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer || this.disposed || !this.lastUsed.size) return
    const nextExpiry = Math.min(...this.lastUsed.values()) + 30 * 60_000
    this.cleanupTimer = setTimeout(
      () => {
        this.cleanupTimer = null
        void this.cleanupIdle()
          .catch((error: unknown) => this.logger.warn('idle Git preview cleanup failed', { error }))
          .finally(() => this.scheduleCleanup())
      },
      Math.max(100, nextExpiry - Date.now()),
    )
    this.cleanupTimer.unref?.()
  }

  private async cleanupIdle(): Promise<void> {
    const expired = [...this.lastUsed].filter(([, used]) => Date.now() - used >= 30 * 60_000)
    for (const [key] of expired) {
      this.lastUsed.delete(key)
      const pending = this.files.get(key)
      this.files.delete(key)
      for (const [token, owner] of this.tokenKeys) if (owner === key) this.tokenKeys.delete(token)
      if (!pending) continue
      const directory = await this.directory
      const relative = await pending.catch(() => null)
      if (directory && relative)
        await fs.rm(path.dirname(path.join(directory, relative)), { recursive: true, force: true })
    }
  }
}
