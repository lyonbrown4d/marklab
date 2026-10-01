import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  RemoteFileStore,
  SyncManifestEntry,
  WorkspaceMutationBoundary,
} from '@electron/services/sync/core/types.js'
import { executeSyncPlan } from '@electron/services/sync/webdavSync/executor.js'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('executeSyncPlan safety', () => {
  it('uploads immutable content objects and commits deletes as tombstones only', async () => {
    const root = await temporaryRoot()
    await fs.writeFile(path.join(root, 'note.md'), 'content')
    const local = entry('note.md', 'content', 7)
    delete local.etag
    const remote = remoteStore()

    const uploaded = await executeSyncPlan(
      baseOptions(root, remote, [{ kind: 'upload', path: 'note.md', local }]),
    )
    expect(remote.write).toHaveBeenCalledWith(
      `.marklab-sync/objects/${local.hash}`,
      expect.any(Readable),
      expect.objectContaining({ ifNoneMatch: '*', size: 7 }),
    )
    expect(uploaded.nextRemoteEntries[0]).toMatchObject({ storage: 'object', hash: local.hash })

    const deleted = await executeSyncPlan(
      baseOptions(
        root,
        remote,
        [{ kind: 'deleteRemote', path: 'note.md', baseline: local, remote: local }],
        [local],
      ),
    )
    expect(deleted.nextRemoteEntries[0]).toMatchObject({
      path: 'note.md',
      deletedAt: expect.any(String),
    })
    expect(remote.delete).not.toHaveBeenCalled()
    expect(remote.move).not.toHaveBeenCalled()
  })

  it('does not download an oversized conflict', async () => {
    const root = await temporaryRoot()
    await fs.writeFile(path.join(root, 'note.md'), 'local')
    const remoteEntry = entry('note.md', 'remote', 100)
    const remote = remoteStore()

    const result = await executeSyncPlan(
      baseOptions(
        root,
        remote,
        [
          {
            kind: 'conflict',
            path: 'note.md',
            local: entry('note.md', 'local', 5),
            remote: remoteEntry,
          },
        ],
        [remoteEntry],
        10,
      ),
    )

    expect(remote.read).not.toHaveBeenCalled()
    expect(result.skipped).toEqual([{ path: 'note.md', reason: 'file_too_large', size: 100 }])
    expect(result.conflicts).toHaveLength(1)
  })

  it('reuses an identical conflict copy and never overwrites different content', async () => {
    const root = await temporaryRoot()
    const body = Buffer.from('remote')
    const remoteEntry = entry('note.md', body.toString(), body.length)
    const firstPath = 'note.conflict-peer-20260101000000-' + remoteEntry.hash.slice(0, 8) + '.md'
    await fs.writeFile(path.join(root, firstPath), 'different')
    const remote = remoteStore({ 'note.md': body })
    const operation = { kind: 'conflict' as const, path: 'note.md', remote: remoteEntry }

    const mutationPaths: string[][] = []
    const mutationBoundary: WorkspaceMutationBoundary = async ({ relativePaths, work }) => {
      mutationPaths.push(relativePaths)
      return work()
    }
    const first = await executeSyncPlan({
      ...baseOptions(root, remote, [operation], [remoteEntry]),
      mutationBoundary,
    })
    expect(first.conflicts[0]?.conflictPath).toBe(firstPath.replace('.md', '-2.md'))
    expect(mutationPaths[0]).toEqual(
      expect.arrayContaining(['note.md', firstPath.replace('.md', '-2.md')]),
    )
    await expect(fs.readFile(path.join(root, firstPath), 'utf8')).resolves.toBe('different')

    const second = await executeSyncPlan(baseOptions(root, remote, [operation], [remoteEntry]))
    expect(second.conflicts[0]?.conflictPath).toBe(first.conflicts[0]?.conflictPath)
    expect(second.changedPaths).toEqual([])
  })

  it('fails closed when the local file changed after scanning', async () => {
    const root = await temporaryRoot()
    await fs.writeFile(path.join(root, 'note.md'), 'changed')
    const scanned = entry('note.md', 'original', 8)
    const remote = remoteStore()

    await expect(
      executeSyncPlan(
        baseOptions(root, remote, [{ kind: 'upload', path: 'note.md', local: scanned }]),
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(remote.write).not.toHaveBeenCalled()
  })
})

const temporaryRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-executor-'))
  roots.push(root)
  return root
}

const entry = (relativePath: string, content: string, size: number): SyncManifestEntry => ({
  path: relativePath,
  hash: createHash('sha256').update(content).digest('hex'),
  size,
  modifiedAt: '2026-01-01T00:00:00.000Z',
  deviceId: 'peer',
  etag: `etag-${relativePath}`,
})

const remoteStore = (files: Record<string, Buffer> = {}) => {
  const data = new Map(Object.entries(files))
  return {
    list: vi.fn(async function* () {}),
    read: vi.fn(async (relativePath: string) => {
      const body = data.get(relativePath)
      if (!body) throw { code: 'NOT_FOUND' }
      return {
        path: relativePath,
        size: body.length,
        modifiedAt: '2026-01-01T00:00:00.000Z',
        body: Readable.from([body]),
        etag: `etag-${relativePath}`,
      }
    }),
    write: vi.fn(async (relativePath: string, body: Readable) => {
      data.set(relativePath, await collect(body))
      return { etag: 'new-etag' }
    }),
    delete: vi.fn(async () => undefined),
    move: vi.fn(async (_source: string, destination: string) => ({
      etag: `moved-${destination}`,
    })),
    readManifest: vi.fn(async () => null),
    writeManifest: vi.fn(async () => ({ etag: 'manifest' })),
  } satisfies RemoteFileStore
}

const collect = async (body: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = []
  for await (const chunk of body) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

const baseOptions = (
  root: string,
  remote: RemoteFileStore,
  operations: Parameters<typeof executeSyncPlan>[0]['operations'],
  remoteEntries: SyncManifestEntry[] = [],
  maxFileSize = 1024,
): Parameters<typeof executeSyncPlan>[0] => ({
  baseline: [],
  deviceId: 'local',
  maxFileSize,
  mutationBoundary: async ({ work }) => work(),
  now: () => new Date('2026-02-01T00:00:00.000Z'),
  operations,
  remote,
  remoteEntries,
  root,
  signal: new AbortController().signal,
})
