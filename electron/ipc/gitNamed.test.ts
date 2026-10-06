import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { registerGitNamedIpc } from '@electron/ipc/gitNamed'

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
    expect(fixture.workspaceMutationCoordinator.runMutation).toHaveBeenCalledTimes(3)
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
    expect(fixture.workspaceMutationCoordinator.runMutation).toHaveBeenCalledOnce()
    expect(fixture.workspace.invalidateAllExternalPaths).toHaveBeenCalledOnce()
  })

  it('serializes push without flushing or invalidating workspace content', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)

    await handlers.get(nativeIpcChannels.gitPush)?.(event(11), { remote: 'origin' })

    expect(fixture.workspace.flushBuffers).not.toHaveBeenCalled()
    expect(fixture.workspace.runExternalWorkspaceMutation).not.toHaveBeenCalled()
    expect(fixture.workspaceMutationCoordinator.runMutation).toHaveBeenCalledOnce()
    expect(fixture.gitService.push).toHaveBeenCalledWith('D:/notes', { remote: 'origin' })
  })

  it('serializes every command that mutates Git metadata', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    const sender = event(12)

    await handlers.get(nativeIpcChannels.gitInit)?.(sender)
    await handlers.get(nativeIpcChannels.gitRemoteSet)?.(sender, {
      name: 'origin',
      url: 'https://example.test/notes.git',
    })
    await handlers.get(nativeIpcChannels.gitRemoteRemove)?.(sender, { name: 'origin' })
    await handlers.get(nativeIpcChannels.gitFetch)?.(sender, { remote: 'origin' })

    expect(fixture.workspaceMutationCoordinator.runMutation).toHaveBeenCalledTimes(4)
    expect(fixture.workspace.flushBuffers).not.toHaveBeenCalled()
    expect(fixture.workspace.invalidateAllExternalPaths).not.toHaveBeenCalled()
  })

  it('does not invalidate a replacement workspace after pull changes the active root', async () => {
    const fixture = createFixture()
    fixture.gitService.pull.mockImplementationOnce(async () => {
      fixture.workspace.rootInfo.mockReturnValue({ kind: 'external', path: 'D:/other' })
      return {}
    })
    const handlers = register(fixture)

    await expect(handlers.get(nativeIpcChannels.gitPull)?.(event(13))).rejects.toThrow(
      'Workspace changed during the Git operation',
    )
    expect(fixture.workspace.invalidateAllExternalPaths).not.toHaveBeenCalled()
  })

  it('rejects before Git work when the workspace changes while buffers flush', async () => {
    const fixture = createFixture()
    fixture.workspace.flushBuffers.mockImplementationOnce(async () => {
      fixture.workspace.rootInfo.mockReturnValue({ kind: 'external', path: 'D:/other' })
    })
    const handlers = register(fixture)

    await expect(handlers.get(nativeIpcChannels.gitPull)?.(event(14))).rejects.toThrow(
      'Workspace changed before the Git operation started',
    )
    expect(fixture.gitService.pull).not.toHaveBeenCalled()
    expect(fixture.workspace.runExternalWorkspaceMutation).not.toHaveBeenCalled()
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
    workspaceMutationCoordinator: {
      runMutation: vi.fn(async (_root: string, work: () => Promise<unknown>) => work()),
    },
    workspaceRegistry: { serviceForWebContents: vi.fn(() => workspace) },
  }
}
