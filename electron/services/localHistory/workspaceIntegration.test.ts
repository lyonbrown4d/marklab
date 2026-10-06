import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { App, Shell } from 'electron'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LocalHistoryService } from '@electron/services/localHistory/service'
import type { Logger } from '@electron/services/logger'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'

vi.mock('@parcel/watcher', () => ({
  default: { subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })) },
}))

const roots: string[] = []
const services: LocalHistoryService[] = []

afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.dispose()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('workspace local history integration', () => {
  it('captures a snapshot only after a buffered workspace save succeeds', async () => {
    const fixtureRoot = await fs.mkdtemp(path.join(tmpdir(), 'marklab-local-history-save-'))
    roots.push(fixtureRoot)
    const userDataPath = path.join(fixtureRoot, 'user-data')
    const workspacePath = path.join(fixtureRoot, 'workspace')
    await fs.mkdir(workspacePath, { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'guide.md'), '# Before\n')
    const history = new LocalHistoryService({ userDataPath })
    services.push(history)
    const capture = vi.spyOn(history, 'capture')
    const workspace = new WorkspaceFileService(
      createApp(userDataPath),
      createShell(),
      createLogger(),
      history,
    )
    await workspace.setRoot({ path: workspacePath })
    await workspace.readFile({ path: 'guide.md' })

    workspace.updateBuffer({ path: 'guide.md', content: '# After\n' })
    await workspace.flushBuffers()

    expect(capture).toHaveBeenCalledOnce()
    const [entry] = await history.list({ kind: 'external', path: workspacePath }, 'guide.md')
    expect(entry).toMatchObject({ path: 'guide.md', source: 'save' })
    await expect(
      history.read({ kind: 'external', path: workspacePath }, 'guide.md', entry!.id),
    ).resolves.toMatchObject({ content: '# After\n' })
    workspace.dispose()
  })
})

const createApp = (userDataPath: string): App =>
  ({
    getPath: vi.fn(() => userDataPath),
    on: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as App

const createShell = (): Shell => ({ openPath: vi.fn(async () => '') }) as unknown as Shell

const createLogger = (): Logger => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return logger as unknown as Logger
}
