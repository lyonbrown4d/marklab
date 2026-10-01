import type { Readable } from 'node:stream'

export type WebDavProfile = {
  id: string
  label: string
  endpoint: string
  basePath: string
  username: string
  allowInsecureLocal: boolean
  sessionOnly: boolean
  hasPassword: boolean
  createdAt: string
  updatedAt: string
}

export type WebDavProfileInput = {
  id: string
  label: string
  endpoint: string
  basePath?: string
  username: string
  password?: string | null
  allowInsecureLocal?: boolean
  sessionOnly?: boolean
}

export type WebDavConnectionResult =
  | { ok: true }
  | {
      ok: false
      code: WebDavErrorCode
      message: string
    }

export type WebDavErrorCode =
  | 'ABORTED'
  | 'AUTHENTICATION_FAILED'
  | 'FORBIDDEN'
  | 'INVALID_ENDPOINT'
  | 'INVALID_PATH'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'ORIGIN_MISMATCH'
  | 'REMOTE_ERROR'
  | 'TIMEOUT'
  | 'network'
  | 'precondition_failed'

export type WebDavOperationOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

export type WebDavEntry = {
  path: string
  name: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: string | null
  etag: string | null
  mime?: string
}

export type WebDavCustomRequest = WebDavOperationOptions & {
  method: string
  headers?: Record<string, string>
  body?: string | Uint8Array | ArrayBuffer
}

export type WebDavCustomResponse = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: ArrayBuffer
}

export type WebDavRemoteClient = {
  testConnection: (options?: WebDavOperationOptions) => Promise<WebDavConnectionResult>
  list: (remotePath?: string, options?: WebDavOperationOptions) => Promise<WebDavEntry[]>
  stat: (remotePath: string, options?: WebDavOperationOptions) => Promise<WebDavEntry>
  downloadBuffer: (remotePath: string, options?: WebDavOperationOptions) => Promise<Buffer>
  downloadStream: (remotePath: string, options?: WebDavOperationOptions) => Readable
  createDirectory: (
    remotePath: string,
    options?: WebDavOperationOptions & { recursive?: boolean },
  ) => Promise<void>
  upload: (
    remotePath: string,
    data: string | Uint8Array | ArrayBuffer | Readable,
    options?: WebDavOperationOptions & {
      contentLength?: number
      headers?: Record<string, string>
      overwrite?: boolean
    },
  ) => Promise<boolean>
  delete: (
    remotePath: string,
    options?: WebDavOperationOptions & { headers?: Record<string, string> },
  ) => Promise<void>
  move: (
    sourcePath: string,
    destinationPath: string,
    options?: WebDavOperationOptions & { headers?: Record<string, string>; overwrite?: boolean },
  ) => Promise<void>
  customRequest: (remotePath: string, request: WebDavCustomRequest) => Promise<WebDavCustomResponse>
}

export type WebDavSafeStorage = {
  isAsyncEncryptionAvailable: () => Promise<boolean>
  encryptStringAsync: (plainText: string) => Promise<Buffer>
  decryptStringAsync: (encrypted: Buffer) => Promise<{ result: string; shouldReEncrypt: boolean }>
  getSelectedStorageBackend?: () => string
}

export type WebDavProfileStoreContract = {
  list: () => Promise<WebDavProfile[]>
  get: (id: string) => Promise<WebDavProfile | null>
  update: (input: WebDavProfileInput) => Promise<WebDavProfile>
  delete: (id: string) => Promise<{ ok: true }>
  resolvePassword: (id: string) => Promise<string | null>
}

export type WebDavLibraryFileStat = {
  filename: string
  basename: string
  lastmod: string
  size: number
  type: 'file' | 'directory'
  etag: string | null
  mime?: string
}

export type WebDavLibraryResponse = {
  readonly url: string
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly headers: {
    get: (name: string) => string | null
    forEach: (callback: (value: string, key: string) => void) => void
  }
  arrayBuffer: () => Promise<ArrayBuffer>
  text: () => Promise<string>
}

type LibraryOptions = {
  signal?: AbortSignal
  headers?: Record<string, string>
  overwrite?: boolean
  format?: 'binary'
  contentLength?: number
  recursive?: boolean
}

export type WebDavLibraryClient = {
  createDirectory: (path: string, options?: LibraryOptions) => Promise<void>
  customRequest: (
    path: string,
    options: LibraryOptions & {
      method: string
      data?: string | Uint8Array | ArrayBuffer
    },
  ) => Promise<WebDavLibraryResponse>
  deleteFile: (path: string, options?: LibraryOptions) => Promise<void>
  getDirectoryContents: (path: string, options?: LibraryOptions) => Promise<WebDavLibraryFileStat[]>
  getFileContents: (
    path: string,
    options?: LibraryOptions,
  ) => Promise<Uint8Array | ArrayBuffer | string>
  createReadStream: (path: string, options?: LibraryOptions) => Readable
  moveFile: (source: string, destination: string, options?: LibraryOptions) => Promise<void>
  putFileContents: (
    path: string,
    data: string | Uint8Array | ArrayBuffer | Readable,
    options?: LibraryOptions,
  ) => Promise<boolean>
  stat: (path: string, options?: LibraryOptions) => Promise<WebDavLibraryFileStat>
}

export type WebDavLibraryClientFactory = (
  endpoint: string,
  options: {
    username?: string
    password?: string
    httpAgent?: unknown
    httpsAgent?: unknown
    entityDecoder: { limit: { maxTotalExpansions: number; maxExpandedLength: number } }
  },
) => WebDavLibraryClient

export type WebDavClientAdapterOptions = {
  createClient: WebDavLibraryClientFactory
  defaultTimeoutMs?: number
}

export type WebDavProfileStoreOptions = { platform?: NodeJS.Platform }
