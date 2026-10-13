import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import type { App, Shell } from 'electron'
import watcher from '@parcel/watcher'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { noopLogger } from '@electron/services/logger'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'

vi.mock('@parcel/watcher', () => ({
  default: { subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })) },
}))
const roots: string[] = []
const services: WorkspaceFileService[] = []
const fixture = async () => {
  const userData = await fs.mkdtemp(path.join(tmpdir(), 'marklab-lazy-workspace-'))
  roots.push(userData)
  const app = { getPath: () => userData, on: vi.fn(), removeListener: vi.fn() } as unknown as App
  const shell = { openPath: vi.fn(async () => '') } as unknown as Shell
  const service = new WorkspaceFileService(app, shell, noopLogger, {
    capture: vi.fn(async () => undefined),
  } as unknown as LocalHistoryServiceContract)
  services.push(service)
  return { service, userData, root: path.join(userData, 'workspace') }
}
const holdDefaultListing = (root: string) => {
  const readdir = fs.readdir.bind(fs)
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const started = vi.fn()
  vi.spyOn(fs, 'readdir').mockImplementation(async (...args) => {
    if (String(args[0]) === root) {
      started()
      await held
    }
    return readdir(...args)
  })
  return { started, release }
}
afterEach(async () => {
  for (const service of services.splice(0)) service.dispose()
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('WorkspaceFileService lazy default root', () => {
  it('constructs without filesystem scans or synchronous creation', async () => {
    const mkdir = vi.spyOn(fsSync, 'mkdirSync')
    const read = vi.spyOn(fsSync, 'readdirSync')
    const f = await fixture()
    expect(f.service.rootInfo()).toEqual({ kind: 'internal', path: f.root })
    expect(mkdir).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
    await expect(fs.access(f.root)).rejects.toThrow()
  })

  it('supports the first open, edit and flush before any snapshot or prewarm', async () => {
    const f = await fixture()
    expect(await f.service.openFile({ path: 'Untitled.md' })).toBe('')
    f.service.updateBuffer({ path: 'Untitled.md', content: '# First edit' })
    await f.service.flushBuffers()
    expect(await fs.readFile(path.join(f.root, 'Untitled.md'), 'utf8')).toBe('# First edit')
    const external = path.join(f.userData, 'external')
    await fs.mkdir(external)
    await f.service.setRoot({ path: external })
    expect(await fs.readFile(path.join(f.root, 'Untitled.md'), 'utf8')).toBe('# First edit')
  })

  it('flushes a prepared default buffer to its captured root before switching', async () => {
    const f = await fixture()
    await f.service.openFile({ path: 'Untitled.md' })
    f.service.updateBuffer({ path: 'Untitled.md', content: '# Saved before switch' })
    const external = path.join(f.userData, 'external')
    await fs.mkdir(external)
    await fs.writeFile(path.join(external, 'Untitled.md'), '# Other workspace')
    await f.service.setRoot({ path: external })
    expect(await fs.readFile(path.join(f.root, 'Untitled.md'), 'utf8')).toBe(
      '# Saved before switch',
    )
    expect(await fs.readFile(path.join(external, 'Untitled.md'), 'utf8')).toBe('# Other workspace')
  })

  it('prepares an untouched default root when selecting the same initial root', async () => {
    const f = await fixture()
    await f.service.setRoot({ path: null })
    expect(await f.service.initialTreeFile()).toMatchObject({ path: 'Untitled.md' })
    await f.service.createFile({ path: 'first.md', content: '# First' })
    expect(await fs.readFile(path.join(f.root, 'first.md'), 'utf8')).toBe('# First')
  })

  it.each(['open', 'create'] as const)(
    'rejects an in-flight default %s after root selection without redirecting it',
    async (operation) => {
      const f = await fixture()
      const listing = holdDefaultListing(f.root)
      const request =
        operation === 'open'
          ? f.service.openFile({ path: 'Untitled.md' })
          : f.service.createFile({ path: 'new.md', content: '# New' })
      const rejected = expect(request).rejects.toThrow('Workspace changed')
      await vi.waitFor(() => expect(listing.started).toHaveBeenCalled())
      const external = path.join(f.userData, 'external')
      await fs.mkdir(external)
      await fs.writeFile(path.join(external, 'Untitled.md'), '# External')
      await f.service.setRoot({ path: external })
      expect(await f.service.openFile({ path: 'Untitled.md' })).toBe('# External')
      listing.release()
      await rejected
      await expect(fs.access(path.join(external, 'new.md'))).rejects.toThrow()
      await vi.waitFor(() =>
        expect(vi.mocked(watcher.subscribe).mock.calls.some(([root]) => root === external)).toBe(
          true,
        ),
      )
      expect(vi.mocked(watcher.subscribe).mock.calls.some(([root]) => root === f.root)).toBe(false)
    },
  )

  it.each([
    'directory',
    'rename',
    'delete',
    'metadata',
    'preview',
    'system',
    'external-path',
    'external-root',
  ] as const)('prepares the initial workspace before its first %s operation', async (operation) => {
    const f = await fixture()
    if (operation === 'directory') {
      await f.service.createDir({ path: 'notes' })
      expect((await fs.stat(path.join(f.root, 'notes'))).isDirectory()).toBe(true)
    } else if (operation === 'rename') {
      await f.service.renamePath({ from: 'Untitled.md', to: 'renamed.md' })
      expect(await fs.readFile(path.join(f.root, 'renamed.md'), 'utf8')).toBe('')
    } else if (operation === 'delete') {
      await f.service.deletePath({ path: 'Untitled.md' })
      await expect(fs.access(path.join(f.root, 'Untitled.md'))).rejects.toThrow()
    } else if (operation === 'metadata') {
      expect(await f.service.pathMetadata({ path: 'Untitled.md' })).toMatchObject({
        kind: 'file',
        size_bytes: 0,
      })
    } else if (operation === 'preview') {
      expect(await f.service.readTextPreview({ path: 'Untitled.md', limit_bytes: 64 })).toEqual({
        content: '',
        truncated: false,
      })
    } else if (operation === 'system') {
      await f.service.openPathInSystem({ path: 'Untitled.md' })
      expect(await fs.readFile(path.join(f.root, 'Untitled.md'), 'utf8')).toBe('')
    } else {
      const write = () => fs.writeFile(path.join(f.root, 'external.md'), '# External write')
      if (operation === 'external-path')
        await f.service.runExternalPathMutation(['external.md'], write)
      else await f.service.runExternalWorkspaceMutation(write)
      expect(await fs.readFile(path.join(f.root, 'external.md'), 'utf8')).toBe('# External write')
    }
  })

  it('opens a single document while default discovery remains pending', async () => {
    const f = await fixture()
    const listing = holdDefaultListing(f.root)
    const pending = f.service.snapshot()
    await vi.waitFor(() => expect(listing.started).toHaveBeenCalled())
    const file = path.join(f.userData, 'single.md')
    await fs.writeFile(file, '# Single')
    await f.service.setSingleFile({ path: file })
    expect(await f.service.openFile({ path: 'single.md' })).toBe('# Single')
    listing.release()
    expect((await pending).root).toEqual({ kind: 'single', path: file })
  })
})
