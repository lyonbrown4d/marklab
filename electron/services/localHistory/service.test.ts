import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_LOCAL_HISTORY_MAX_ENTRIES,
  DEFAULT_LOCAL_HISTORY_MAX_FILE_SIZE_BYTES,
  DEFAULT_LOCAL_HISTORY_MERGE_WINDOW_MS,
  LocalHistoryService,
} from '@electron/services/localHistory/service.js'

const roots: string[] = []

const createFixture = async (options: { maxEntriesPerFile?: number; now?: () => number } = {}) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-local-history-'))
  roots.push(root)
  const userDataPath = path.join(root, 'user-data')
  const workspacePath = path.join(root, 'workspace')
  await fs.mkdir(workspacePath, { recursive: true })
  return {
    service: new LocalHistoryService({ ...options, userDataPath }),
    storagePath: path.join(userDataPath, 'local-history-v1'),
    workspace: { kind: 'external' as const, path: workspacePath },
    workspacePath,
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('LocalHistoryService', () => {
  it('uses VS Code-compatible retention, size, and merge defaults', () => {
    expect(DEFAULT_LOCAL_HISTORY_MAX_ENTRIES).toBe(50)
    expect(DEFAULT_LOCAL_HISTORY_MAX_FILE_SIZE_BYTES).toBe(256 * 1024)
    expect(DEFAULT_LOCAL_HISTORY_MERGE_WINDOW_MS).toBe(10_000)
  })

  it('deduplicates identical saves and retains only the newest configured versions', async () => {
    let now = Date.UTC(2026, 8, 30)
    const { service, workspace } = await createFixture({
      maxEntriesPerFile: 2,
      now: () => (now += 10_001),
    })

    await service.capture(workspace, 'notes/guide.md', '# One\n')
    await service.capture(workspace, 'notes/guide.md', '# One\n')
    await service.capture(workspace, 'notes/guide.md', '# Two\n')
    await service.capture(workspace, 'notes/guide.md', '# Three\n')

    const entries = await service.list(workspace, 'notes/guide.md')
    expect(entries).toHaveLength(2)
    await expect(service.read(workspace, 'notes/guide.md', entries[0]!.id)).resolves.toMatchObject({
      content: '# Three\n',
    })
    await expect(service.read(workspace, 'notes/guide.md', entries[1]!.id)).resolves.toMatchObject({
      content: '# Two\n',
    })
  })

  it('merges save snapshots created within the ten-second merge window', async () => {
    let now = Date.UTC(2026, 8, 30)
    const { service, workspace } = await createFixture({ now: () => now })
    await service.capture(workspace, 'guide.md', '# One\n')
    now += 9_999
    await service.capture(workspace, 'guide.md', '# Two\n')

    const entries = await service.list(workspace, 'guide.md')
    expect(entries).toHaveLength(1)
    await expect(service.read(workspace, 'guide.md', entries[0]!.id)).resolves.toMatchObject({
      content: '# Two\n',
      source: 'save',
    })
  })

  it('skips files larger than 256KB without failing the save flow', async () => {
    const { service, workspace } = await createFixture()

    await expect(
      service.capture(workspace, 'large.md', 'a'.repeat(256 * 1024 + 1)),
    ).resolves.toEqual({ status: 'skipped', reason: 'file-too-large' })
    await expect(service.list(workspace, 'large.md')).resolves.toEqual([])
  })

  it('stores atomic snapshots below userData without touching the workspace', async () => {
    const { service, storagePath, workspace, workspacePath } = await createFixture()
    await fs.mkdir(path.join(workspacePath, 'notes'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'notes', 'guide.md'), '# Workspace\n')

    await service.capture(workspace, 'notes/guide.md', '# Snapshot\n')

    expect(await fs.readFile(path.join(workspacePath, 'notes', 'guide.md'), 'utf8')).toBe(
      '# Workspace\n',
    )
    const storageFiles = await recursiveFiles(storagePath)
    expect(storageFiles).toHaveLength(1)
    expect(storageFiles[0]).toMatch(/\.json$/)
    expect(storageFiles.some((file) => file.includes('.tmp-'))).toBe(false)
  })

  it('restores through the supplied atomic workspace writer', async () => {
    const { service, workspace } = await createFixture()
    await service.capture(workspace, 'guide.md', '# Saved\n')
    const [entry] = await service.list(workspace, 'guide.md')
    const write = vi.fn(async () => undefined)

    const restored = await service.restore(workspace, 'guide.md', entry!.id, write)

    expect(write).toHaveBeenCalledWith('# Saved\n')
    expect(restored.content).toBe('# Saved\n')
  })

  it('deletes individual versions and clears a file timeline', async () => {
    let now = Date.UTC(2026, 8, 30)
    const { service, workspace } = await createFixture({ now: () => (now += 10_001) })
    await service.capture(workspace, 'guide.md', '# One\n')
    await service.capture(workspace, 'guide.md', '# Two\n')
    const entries = await service.list(workspace, 'guide.md')

    await expect(service.delete(workspace, 'guide.md', entries[0]!.id)).resolves.toEqual({
      ok: true,
    })
    await expect(service.clear(workspace, 'guide.md')).resolves.toEqual({ deleted: 1 })
    await expect(service.list(workspace, 'guide.md')).resolves.toEqual([])
  })

  it('rejects unsafe workspace, file, and entry identifiers', async () => {
    const { service, workspace } = await createFixture()

    await expect(service.list(workspace, '../secret.md')).rejects.toThrow(/relative path/i)
    await expect(service.list({ kind: 'external', path: 'relative' }, 'guide.md')).rejects.toThrow(
      /workspace path/i,
    )
    await expect(service.read(workspace, 'guide.md', '../../entry.json')).rejects.toThrow(
      /entry id/i,
    )
  })
})

const recursiveFiles = async (root: string): Promise<string[]> => {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(root, entry.name)
      return entry.isDirectory() ? recursiveFiles(target) : [target]
    }),
  )
  return files.flat()
}
