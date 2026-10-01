import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { vi } from 'vitest'

import type {
  LocalSyncState,
  LocalSyncStateStore,
  RemoteFileStore,
  SyncManifest,
  WorkspaceMutationBoundary,
} from '@electron/services/sync/core/types.js'
import { WebDavSyncEngine } from '@electron/services/sync/webdavSync/engine.js'

const roots: string[] = []

export const cleanupFixtures = async (): Promise<void> => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
}

type FixtureOptions = {
  beforeMutation?: (relativePaths: string[]) => Promise<void>
  failManifestWrites?: number
  initialState?: LocalSyncState
  maxFileSize?: number
  remoteFiles?: Record<string, Buffer>
  remoteManifest?: SyncManifest | null
}

export const createFixture = async (options: FixtureOptions = {}) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-engine-'))
  roots.push(root)
  let storedState = options.initialState ?? null
  let currentManifest = options.remoteManifest === undefined ? manifest([]) : options.remoteManifest
  let manifestEtag = 'manifest-1'
  let failures = options.failManifestWrites ?? 0
  const files = new Map(Object.entries(options.remoteFiles ?? {}))
  const remote = {
    list: vi.fn(() => listFiles(files)),
    read: vi.fn(async (relativePath: string) => {
      const body = files.get(relativePath)
      if (!body) throw { code: 'NOT_FOUND' }
      return {
        path: relativePath,
        body: Readable.from([body]),
        size: body.length,
        modifiedAt: '2026-01-01T00:00:00.000Z',
        etag: `etag-${relativePath}`,
      }
    }),
    write: vi.fn(async (relativePath: string, body: Readable) => {
      files.set(relativePath, await collect(body))
      return { etag: `etag-${relativePath}` }
    }),
    delete: vi.fn(async (relativePath: string) => {
      files.delete(relativePath)
    }),
    move: vi.fn(async (sourcePath: string, destinationPath: string) => {
      const body = files.get(sourcePath)
      if (body) files.set(destinationPath, body)
      files.delete(sourcePath)
      return { etag: `etag-${destinationPath}` }
    }),
    readManifest: vi.fn(async () =>
      currentManifest ? { manifest: currentManifest, etag: manifestEtag } : null,
    ),
    writeManifest: vi.fn(async (next: SyncManifest) => {
      if (failures > 0) {
        failures -= 1
        throw { code: 'precondition_failed' }
      }
      currentManifest = next
      manifestEtag = `manifest-${Number(manifestEtag.split('-')[1]) + 1}`
      return { etag: manifestEtag }
    }),
  } satisfies RemoteFileStore
  const stateStore = {
    load: vi.fn(async () => storedState),
    save: vi.fn(async (_root: string, next: LocalSyncState) => {
      storedState = next
    }),
  } satisfies LocalSyncStateStore
  const flushWorkspace = vi.fn(async () => undefined)
  const invalidateWorkspace = vi.fn(async () => undefined)
  const mutationBoundary = vi.fn()
  const runMutation: WorkspaceMutationBoundary = async (mutation) => {
    await options.beforeMutation?.(mutation.relativePaths)
    mutationBoundary(mutation)
    return mutation.work()
  }
  const engine = new WebDavSyncEngine({
    deviceId: 'local-device',
    flushWorkspace,
    invalidateWorkspace,
    ...(options.maxFileSize === undefined ? {} : { maxFileSize: options.maxFileSize }),
    mutationBoundary: runMutation,
    remote,
    stateStore,
    now: () => new Date('2026-02-03T04:05:06.000Z'),
  })
  return {
    engine,
    flushWorkspace,
    invalidateWorkspace,
    mutationBoundary,
    remote,
    root,
    stateStore,
  }
}

export const manifest = (entries: SyncManifest['entries']): SyncManifest => ({
  version: 1,
  deviceId: 'remote-device',
  updatedAt: '2026-01-01T00:00:00.000Z',
  entries,
})

export const state = (baseline: LocalSyncState['baseline']): LocalSyncState => ({
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  baseline,
})

export const remoteEntry = (relativePath: string, body: Buffer) => ({
  path: relativePath,
  hash: createHash('sha256').update(body).digest('hex'),
  size: body.length,
  modifiedAt: '2026-01-02T00:00:00.000Z',
  deviceId: 'remote-device',
  etag: `etag-${relativePath}`,
})

const listFiles = async function* (files: Map<string, Buffer>) {
  for (const [relativePath, body] of files) {
    yield {
      path: relativePath,
      size: body.length,
      modifiedAt: '2026-01-01T00:00:00.000Z',
      etag: `etag-${relativePath}`,
    }
  }
}
const collect = async (body: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
