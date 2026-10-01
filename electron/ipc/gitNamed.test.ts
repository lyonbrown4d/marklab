import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { registerGitNamedIpc } from '@electron/ipc/gitNamed.js'

describe('named Git IPC', () => {
  it('always operates on the workspace owned by the sender', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)

    await handlers.get(nativeIpcChannels.gitStatus)?.(event(7), { rootPath: 'C:/escape' })
    await handlers.get(nativeIpcChannels.gitFetch)?.(event(7), { remote: 'origin' })

    expect(fixture.workspaceRegistry.serviceForWebContents).toHaveBeenCalledTimes(2)
    expect(fixture.gitService.status).toHaveBeenCalledWith('D:/notes')
    expect(fixture.gitService.fetch).toHaveBeenCalledWith('D:/notes', 'origin')
  })

  it('routes typed diff, commit, remote configuration and push options', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    const sender = event(8)

    await handlers.get(nativeIpcChannels.gitFileDiff)?.(sender, {
      path: 'note.md',
      section: 'unstaged',
    })
    await handlers.get(nativeIpcChannels.gitCommitAll)?.(sender, { message: 'save notes' })
    await handlers.get(nativeIpcChannels.gitRemoteSet)?.(sender, {
      name: 'origin',
      url: 'https://example.test/notes.git',
    })
    await handlers.get(nativeIpcChannels.gitPush)?.(sender, {
      remote: 'origin',
      setUpstream: true,
    })

    expect(fixture.gitService.fileDiff).toHaveBeenCalledWith('D:/notes', 'note.md', 'unstaged')
    expect(fixture.gitService.commitAll).toHaveBeenCalledWith('D:/notes', 'save notes')
    expect(fixture.workspace.flushBuffers).toHaveBeenCalledOnce()
    expect(fixture.workspace.runExternalWorkspaceMutation).toHaveBeenCalledOnce()
    expect(fixture.gitService.setRemote).toHaveBeenCalledWith(
      'D:/notes',
      'origin',
      'https://example.test/notes.git',
    )
    expect(fixture.gitService.push).toHaveBeenCalledWith('D:/notes', {
      remote: 'origin',
      setUpstream: true,
    })
  })

  it('rejects malformed payloads before calling Git', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)

    await expect(
      handlers.get(nativeIpcChannels.gitRemoteSet)?.(event(9), { name: '', url: 1 }),
    ).rejects.toThrow()
    expect(fixture.gitService.setRemote).not.toHaveBeenCalled()
  })

  it('flushes and invalidates the workspace around a failed pull', async () => {
    const fixture = createFixture()
    fixture.gitService.pull.mockRejectedValueOnce(new Error('pull failed'))
    const handlers = register(fixture)

    await expect(handlers.get(nativeIpcChannels.gitPull)?.(event(10))).rejects.toThrow(
      'pull failed',
    )

    expect(fixture.workspace.flushBuffers).toHaveBeenCalledOnce()
    expect(fixture.workspace.runExternalWorkspaceMutation).toHaveBeenCalledOnce()
    expect(fixture.workspace.invalidateAllExternalPaths).toHaveBeenCalledOnce()
  })
})

type Handler = (event: { sender: { id: number } }, payload?: unknown) => unknown

const register = (fixture: ReturnType<typeof createFixture>) => {
  const handlers = new Map<string, Handler>()
  registerGitNamedIpc(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as never,
    fixture as never,
  )
  return handlers
}

const event = (id: number) => ({ sender: { id } })

const createFixture = () => {
  const workspace = {
    flushBuffers: vi.fn(async () => undefined),
    invalidateAllExternalPaths: vi.fn(),
    rootInfo: vi.fn(() => ({ kind: 'external', path: 'D:/notes' })),
    runExternalWorkspaceMutation: vi.fn(async (work: () => Promise<unknown>) => work()),
  }
  return {
    gitService: {
      commitAll: vi.fn(async () => ({})),
      discover: vi.fn(async () => ({})),
      fetch: vi.fn(async () => ({})),
      fileDiff: vi.fn(async () => ({})),
      init: vi.fn(async () => ({})),
      pull: vi.fn(async () => ({})),
      push: vi.fn(async () => ({})),
      removeRemote: vi.fn(async () => ({})),
      remoteStatus: vi.fn(async () => ({})),
      setRemote: vi.fn(async () => ({})),
      status: vi.fn(async () => ({})),
    },
    workspace,
    workspaceRegistry: { serviceForWebContents: vi.fn(() => workspace) },
  }
}
