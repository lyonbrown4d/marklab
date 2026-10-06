import path from 'node:path'
import { Readable } from 'node:stream'

import type {
  RemoteFileMetadata,
  RemoteFileStore,
  RemoteWriteCondition,
  SyncManifest,
} from '@electron/services/sync/core/types'
import { WebDavError } from '@electron/services/sync/webdav/errors'
import { normalizeRemotePath } from '@electron/services/sync/webdav/remotePath'
import type {
  WebDavEntry,
  WebDavOperationOptions,
  WebDavRemoteClient,
} from '@electron/services/sync/webdav/types'

const MANIFEST_PATH = '.marklab-sync/manifest.json'
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024

export const createWebDavRemoteFileStore = (
  client: WebDavRemoteClient,
  remoteRoot: string,
): RemoteFileStore => new WebDavRemoteFileStore(client, normalizeRemoteRoot(remoteRoot))

class WebDavRemoteFileStore implements RemoteFileStore {
  constructor(
    private readonly client: WebDavRemoteClient,
    private readonly remoteRoot: string,
  ) {}

  assertManifestWritable(manifest: SyncManifest): void {
    serializeManifest(manifest)
  }

  async hasSyncMetadata(options: { signal: AbortSignal }): Promise<boolean> {
    try {
      await this.client.stat(this.scoped('.marklab-sync'), options)
      return true
    } catch (error) {
      if (error instanceof WebDavError && error.code === 'NOT_FOUND') return false
      throw error
    }
  }

  async *list(options: { signal: AbortSignal }): AsyncIterable<RemoteFileMetadata> {
    const directories = ['']
    const visited = new Set<string>()
    while (directories.length > 0) {
      options.signal.throwIfAborted()
      const directory = directories.shift()!
      if (visited.has(directory)) continue
      visited.add(directory)
      let entries: WebDavEntry[]
      try {
        entries = await this.client.list(this.scoped(directory), options)
      } catch (error) {
        if (directory === '' && error instanceof WebDavError && error.code === 'NOT_FOUND') return
        throw error
      }
      for (const entry of entries) {
        options.signal.throwIfAborted()
        const child = joinChild(directory, entry)
        if (entry.type === 'directory') directories.push(child)
        else yield metadata(child, entry)
      }
    }
  }

  async read(relativePath: string, options: WebDavOperationOptions) {
    const path = this.scoped(relativePath)
    const entry = await this.client.stat(path, options)
    if (entry.type !== 'file') throw new WebDavError('INVALID_PATH')
    return {
      ...metadata(normalizedRelativePath(relativePath), entry),
      body: this.client.downloadStream(path, options),
    }
  }

  async write(
    relativePath: string,
    body: Readable,
    options: RemoteWriteCondition & { signal: AbortSignal; size: number },
  ): Promise<{ etag?: string }> {
    const path = this.scoped(relativePath)
    await this.ensureParent(path, options.signal)
    const uploaded = await this.client.upload(path, body, {
      contentLength: options.size,
      headers: conditionHeaders(options),
      ...(options.ifNoneMatch === '*' ? { overwrite: false } : {}),
      signal: options.signal,
    })
    if (!uploaded) throw new WebDavError('precondition_failed')
    const written = await this.client.stat(path, { signal: options.signal })
    return written.etag ? { etag: written.etag } : {}
  }

  delete(
    relativePath: string,
    options: Pick<RemoteWriteCondition, 'ifMatch'> & { signal: AbortSignal },
  ): Promise<void> {
    return this.client.delete(this.scoped(relativePath), {
      headers: conditionHeaders(options),
      signal: options.signal,
    })
  }

  async move(
    from: string,
    to: string,
    options: Pick<RemoteWriteCondition, 'ifMatch' | 'ifNoneMatch'> & { signal: AbortSignal },
  ): Promise<{ etag?: string }> {
    const destination = this.scoped(to)
    await this.ensureParent(destination, options.signal)
    await this.client.move(this.scoped(from), destination, {
      headers: conditionHeaders(options),
      ...(options.ifNoneMatch === '*' ? { overwrite: false } : {}),
      signal: options.signal,
    })
    const moved = await this.client.stat(destination, { signal: options.signal })
    return moved.etag ? { etag: moved.etag } : {}
  }

  async readManifest(options: { signal: AbortSignal }) {
    try {
      const path = this.scoped(MANIFEST_PATH)
      const entry = await this.client.stat(path, options)
      if (entry.size > MAX_MANIFEST_BYTES) throw new WebDavError('INVALID_REQUEST')
      const body = await this.client.downloadBuffer(path, options)
      if (body.byteLength > MAX_MANIFEST_BYTES) throw new WebDavError('INVALID_REQUEST')
      return {
        manifest: JSON.parse(body.toString('utf8')) as unknown,
        ...(entry.etag ? { etag: entry.etag } : {}),
      }
    } catch (error) {
      if (error instanceof WebDavError && error.code === 'NOT_FOUND') return null
      throw error
    }
  }

  async writeManifest(
    manifest: SyncManifest,
    options: Pick<RemoteWriteCondition, 'ifMatch' | 'ifNoneMatch'> & { signal: AbortSignal },
  ): Promise<{ etag?: string }> {
    const body = serializeManifest(manifest)
    return this.write(MANIFEST_PATH, Readable.from([body]), {
      ...options,
      size: body.byteLength,
    })
  }

  private scoped(relativePath: string): string {
    const relative = relativePath ? normalizedRelativePath(relativePath) : ''
    return relative ? path.posix.join(this.remoteRoot, relative) : this.remoteRoot
  }

  private ensureParent(remotePath: string, signal: AbortSignal): Promise<void> {
    const parent = path.posix.dirname(remotePath)
    if (parent === '.') return Promise.resolve()
    return this.client.createDirectory(parent, { recursive: true, signal })
  }
}

const serializeManifest = (manifest: SyncManifest): Buffer => {
  const serialized = JSON.stringify(manifest)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_MANIFEST_BYTES) {
    throw new WebDavError('INVALID_REQUEST')
  }
  return Buffer.from(serialized)
}

const normalizeRemoteRoot = (value: string): string => {
  if (value === '/') return ''
  const relative = value.startsWith('/') ? value.slice(1) : value
  return normalizedRelativePath(relative)
}

const normalizedRelativePath = (value: string): string => {
  const normalized = normalizeRemotePath(value).replace(/^\//, '')
  if (!normalized) throw new WebDavError('INVALID_PATH')
  return normalized
}

const joinChild = (directory: string, entry: WebDavEntry): string => {
  if (!entry.name || entry.name.includes('/') || entry.name.includes('\\')) {
    throw new WebDavError('INVALID_PATH')
  }
  return normalizedRelativePath(path.posix.join(directory, entry.name))
}

const metadata = (relativePath: string, entry: WebDavEntry): RemoteFileMetadata => ({
  path: relativePath,
  size: entry.size,
  modifiedAt: entry.modifiedAt ?? new Date(0).toISOString(),
  ...(entry.etag ? { etag: entry.etag } : {}),
})

const conditionHeaders = (condition: RemoteWriteCondition): Record<string, string> => {
  const ifMatch = condition.ifMatch ?? condition.etag
  if (ifMatch && condition.ifNoneMatch) throw new WebDavError('INVALID_REQUEST')
  return {
    ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    ...(condition.ifNoneMatch ? { 'If-None-Match': condition.ifNoneMatch } : {}),
  }
}
