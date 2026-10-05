import { PassThrough, type Readable } from 'node:stream'

import { createClient } from 'webdav'

import { validateWebDavEndpoint } from '@electron/services/sync/webdav/endpoint.js'
import { WebDavError } from '@electron/services/sync/webdav/errors.js'
import { createOriginLockedAgents } from '@electron/services/sync/webdav/originLockedAgent.js'
import { normalizeRemotePath, webDavServerUrl } from '@electron/services/sync/webdav/remotePath.js'
import { createWebDavRequestControl } from '@electron/services/sync/webdav/requestControl.js'
import type {
  WebDavCustomRequest,
  WebDavCustomResponse,
  WebDavEntry,
  WebDavLibraryClient,
  WebDavLibraryClientFactory,
  WebDavLibraryFileStat,
  WebDavOperationOptions,
  WebDavProfile,
  WebDavRemoteClient,
  WebDavClientAdapterOptions,
} from '@electron/services/sync/webdav/types.js'

const DEFAULT_TIMEOUT_MS = 15_000
const allowedCustomMethods = new Set([
  'COPY',
  'DELETE',
  'GET',
  'HEAD',
  'MOVE',
  'OPTIONS',
  'PROPFIND',
  'PUT',
])
const forbiddenHeaders = new Set(['authorization', 'cookie', 'host', 'proxy-authorization'])

export const createWebDavClientAdapter = (
  profile: WebDavProfile,
  password: string | null,
  options: WebDavClientAdapterOptions,
): WebDavRemoteClient => {
  const location = validateWebDavEndpoint(
    profile.endpoint,
    profile.allowInsecureLocal,
    profile.basePath,
  )
  const agents = createOriginLockedAgents(location.endpoint)
  const client = options.createClient(webDavServerUrl(location.endpoint, location.basePath), {
    ...(profile.username ? { username: profile.username } : {}),
    ...(password ? { password } : {}),
    ...agents,
    entityDecoder: { limit: { maxTotalExpansions: 1_000, maxExpandedLength: 50_000 } },
  })
  return new WebDavClientAdapter(
    location.endpoint,
    client,
    options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
}

export const createWebDavRemoteClient = async (
  profile: WebDavProfile,
  password: string | null,
  options: { defaultTimeoutMs?: number } = {},
): Promise<WebDavRemoteClient> => {
  return createWebDavClientAdapter(profile, password, {
    createClient: createClient as unknown as WebDavLibraryClientFactory,
    ...(options.defaultTimeoutMs === undefined
      ? {}
      : { defaultTimeoutMs: options.defaultTimeoutMs }),
  })
}

class WebDavClientAdapter implements WebDavRemoteClient {
  constructor(
    private readonly origin: string,
    private readonly client: WebDavLibraryClient,
    private readonly defaultTimeoutMs: number,
  ) {}

  async testConnection(options?: WebDavOperationOptions) {
    try {
      await this.stat('', options)
      return { ok: true } as const
    } catch (error) {
      const mapped = error instanceof WebDavError ? error : new WebDavError('REMOTE_ERROR')
      return { ok: false, code: mapped.code, message: mapped.message } as const
    }
  }

  list(remotePath = '', options?: WebDavOperationOptions): Promise<WebDavEntry[]> {
    return this.run(options, (signal) =>
      this.client
        .getDirectoryContents(normalizeRemotePath(remotePath), { signal })
        .then((entries) => entries.map(toEntry)),
    )
  }

  stat(remotePath: string, options?: WebDavOperationOptions): Promise<WebDavEntry> {
    return this.run(options, (signal) =>
      this.client.stat(normalizeRemotePath(remotePath), { signal }).then(toEntry),
    )
  }

  downloadBuffer(remotePath: string, options?: WebDavOperationOptions): Promise<Buffer> {
    return this.run(options, async (signal) => {
      const result = await this.client.getFileContents(normalizeRemotePath(remotePath), {
        format: 'binary',
        signal,
      })
      if (typeof result === 'string') return Buffer.from(result)
      return Buffer.from(result instanceof ArrayBuffer ? new Uint8Array(result) : result)
    })
  }

  downloadStream(remotePath: string, options?: WebDavOperationOptions): Readable {
    const control = createWebDavRequestControl(options, this.defaultTimeoutMs)
    const output = new PassThrough()
    try {
      const source = this.client.createReadStream(normalizeRemotePath(remotePath), {
        signal: control.signal,
      })
      const onAbort = () => output.destroy(control.mapError(control.signal.reason))
      const dispose = () => {
        control.signal.removeEventListener('abort', onAbort)
        control.dispose()
      }
      control.signal.addEventListener('abort', onAbort, { once: true })
      source.once('error', (error) => output.destroy(control.mapError(error)))
      source.once('close', dispose)
      output.once('close', dispose)
      source.pipe(output)
    } catch (error) {
      control.dispose()
      output.destroy(control.mapError(error))
    }
    return output
  }

  createDirectory(
    remotePath: string,
    options?: WebDavOperationOptions & { recursive?: boolean },
  ): Promise<void> {
    return this.run(options, (signal) =>
      this.client.createDirectory(normalizeRemotePath(remotePath), {
        ...(options?.recursive === undefined ? {} : { recursive: options.recursive }),
        signal,
      }),
    )
  }

  upload(
    remotePath: string,
    data: string | Uint8Array | ArrayBuffer | Readable,
    options?: WebDavOperationOptions & {
      contentLength?: number
      headers?: Record<string, string>
      overwrite?: boolean
    },
  ): Promise<boolean> {
    const headers = safeHeaders(options?.headers)
    return this.run(options, async (signal) => {
      const uploaded = await this.client.putFileContents(normalizeRemotePath(remotePath), data, {
        headers,
        ...(options?.contentLength === undefined ? {} : { contentLength: options.contentLength }),
        ...(options?.overwrite === undefined ? {} : { overwrite: options.overwrite }),
        signal,
      })
      if (!uploaded) throw new WebDavError('precondition_failed')
      return true
    })
  }

  delete(
    remotePath: string,
    options?: WebDavOperationOptions & { headers?: Record<string, string> },
  ): Promise<void> {
    return this.run(options, (signal) =>
      this.client.deleteFile(normalizeRemotePath(remotePath), {
        headers: safeHeaders(options?.headers),
        signal,
      }),
    )
  }

  move(
    sourcePath: string,
    destinationPath: string,
    options?: WebDavOperationOptions & { headers?: Record<string, string>; overwrite?: boolean },
  ): Promise<void> {
    return this.run(options, (signal) =>
      this.client.moveFile(normalizeRemotePath(sourcePath), normalizeRemotePath(destinationPath), {
        headers: safeHeaders(options?.headers),
        ...(options?.overwrite === undefined ? {} : { overwrite: options.overwrite }),
        signal,
      }),
    )
  }

  async customRequest(
    remotePath: string,
    request: WebDavCustomRequest,
  ): Promise<WebDavCustomResponse> {
    const method = request.method.toUpperCase()
    if (!allowedCustomMethods.has(method)) throw new WebDavError('INVALID_REQUEST')
    const headers = safeHeaders(request.headers)
    return this.run(request, async (signal) => {
      const response = await this.client.customRequest(normalizeRemotePath(remotePath), {
        method,
        headers,
        data: request.body,
        signal,
      })
      this.assertResponseOrigin(response.url)
      if (!response.ok) throw Object.assign(new Error(), { status: response.status })
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value
      })
      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: await response.arrayBuffer(),
      }
    })
  }

  private run<T>(
    options: WebDavOperationOptions | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    return createWebDavRequestControl(options, this.defaultTimeoutMs).run(work)
  }

  private assertResponseOrigin(value: string): void {
    try {
      if (new URL(value).origin === this.origin) return
    } catch {
      // Fall through to the sanitized error below.
    }
    throw new WebDavError('ORIGIN_MISMATCH')
  }
}

const safeHeaders = (headers: Record<string, string> | undefined): Record<string, string> => {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers ?? {})) {
    const normalizedName = name.toLowerCase()
    if (forbiddenHeaders.has(normalizedName) || /[\r\n]/.test(name + value)) {
      throw new WebDavError('INVALID_REQUEST')
    }
    result[name] = normalizedName === 'if-match' ? quotedEntityTag(value) : value
  }
  return result
}

const quotedEntityTag = (value: string): string => {
  const normalized = value.trim()
  if (normalized === '*') return normalized
  if (/^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/.test(normalized)) return normalized
  if (!/^[\x21\x23-\x7e\x80-\xff]+$/.test(normalized)) {
    throw new WebDavError('INVALID_REQUEST')
  }
  return `"${normalized}"`
}

const toEntry = (entry: WebDavLibraryFileStat): WebDavEntry => ({
  path: entry.filename.replace(/^\/+/, ''),
  name: entry.basename,
  type: entry.type,
  size: entry.size,
  modifiedAt: entry.lastmod || null,
  etag: entry.etag,
  ...(entry.mime ? { mime: entry.mime } : {}),
})
