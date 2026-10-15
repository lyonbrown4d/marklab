import { describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels as channels } from '@electron/channels'
import { registerGitNamedIpc } from '@electron/ipc/gitNamed'

type Handler = (event: { sender: { id: number } }, payload?: unknown) => unknown
const sender = { sender: { id: 1 } }
const root = '/workspace/notes'
const hash = 'a'.repeat(40)

const fixture = () => {
  const git = {
    stage: vi.fn(async () => ({})),
    unstage: vi.fn(async () => ({})),
    discard: vi.fn(async () => ({})),
    commitStaged: vi.fn(async () => ({})),
    history: vi.fn(async () => []),
    branches: vi.fn(async () => []),
    reset: vi.fn(async () => ({})),
    switchBranch: vi.fn(async () => ({})),
    revert: vi.fn(async () => ({})),
    operationState: vi.fn(async () => ({ operation: null })),
    continueOperation: vi.fn(async () => ({})),
    abortOperation: vi.fn(async () => ({})),
    stashApply: vi.fn(async () => ({})),
    conflict: vi.fn(async () => ({})),
    saveConflict: vi.fn(async () => ({})),
    commitDiff: vi.fn(async () => ({})),
  }
  const workspace = {
    rootInfo: vi.fn(() => ({ kind: 'external', path: root })),
    flushBuffers: vi.fn(async () => undefined),
    runExternalWorkspaceMutation: vi.fn(async (work: () => Promise<unknown>) => work()),
    invalidateAllExternalPaths: vi.fn(),
  }
  const coordinator = {
    runMutation: vi.fn(async (_root: string, work: () => Promise<unknown>) => work()),
  }
  const handlers = new Map<string, Handler>()
  registerGitNamedIpc(
    { handle: (key: string, handler: Handler) => handlers.set(key, handler) } as never,
    {
      gitService: git,
      workspaceMutationCoordinator: coordinator,
      workspaceRegistry: { serviceForWebContents: () => workspace },
    } as never,
  )
  const call = (channel: string, payload: Record<string, unknown> = {}) =>
    Promise.resolve().then(() =>
      handlers.get(channel)?.(sender, { expectedRoot: root, ...payload }),
    )
  return { git, workspace, coordinator, call }
}

describe('scoped Git operation IPC', () => {
  it('reads conflict index versions in the selected workspace', async () => {
    const f = fixture()
    await f.call(channels.gitConflict, { path: 'note.md' })
    expect(f.git.conflict).toHaveBeenCalledWith(root, 'note.md')
    expect(f.workspace.flushBuffers).not.toHaveBeenCalled()
  })

  it('flushes and locks a merge-result save, forwarding its revision and staging choice', async () => {
    const f = fixture()
    const revision = 'b'.repeat(64)
    await f.call(channels.gitConflictSave, {
      path: 'note.md',
      content: 'merged',
      revision,
      stage: true,
    })
    expect(f.git.saveConflict).toHaveBeenCalledWith(root, {
      path: 'note.md',
      content: 'merged',
      revision,
      stage: true,
      deleteFile: undefined,
    })
    expect(f.workspace.flushBuffers).toHaveBeenCalledOnce()
    expect(f.workspace.runExternalWorkspaceMutation).toHaveBeenCalledOnce()
    expect(f.workspace.invalidateAllExternalPaths).toHaveBeenCalledOnce()
  })

  it('rejects a stale workspace or malformed revision before saving a merge result', async () => {
    const f = fixture()
    await expect(
      f.call(channels.gitConflictSave, { path: 'note.md', content: 'merged', revision: 'bad' }),
    ).rejects.toThrow()
    await expect(
      f.call(channels.gitConflictSave, {
        path: 'note.md',
        content: 'merged',
        revision: 'b'.repeat(64),
        expectedRoot: '/old',
      }),
    ).rejects.toThrow('Workspace changed')
    expect(f.git.saveConflict).not.toHaveBeenCalled()
    expect(f.workspace.flushBuffers).not.toHaveBeenCalled()
  })
  it.each([
    [channels.gitStage, 'stage', { paths: ['note.md'] }, ['note.md']],
    [channels.gitUnstage, 'unstage', { paths: ['note.md'] }, ['note.md']],
    [channels.gitDiscard, 'discard', { paths: ['note.md'] }, ['note.md']],
  ] as const)(
    'flushes and locks file mutation %s before acting',
    async (channel, method, payload, paths) => {
      const f = fixture()
      await f.call(channel, payload)
      expect(f.git[method]).toHaveBeenCalledWith(root, paths)
      expect(f.workspace.flushBuffers).toHaveBeenCalledOnce()
      expect(f.workspace.runExternalWorkspaceMutation).toHaveBeenCalledOnce()
      expect(f.workspace.invalidateAllExternalPaths).toHaveBeenCalledOnce()
      expect(f.workspace.flushBuffers.mock.invocationCallOrder[0]).toBeLessThan(
        f.git[method].mock.invocationCallOrder[0]!,
      )
    },
  )

  it('rejects a stale workspace before flushing or mutating', async () => {
    const f = fixture()
    f.workspace.rootInfo.mockReturnValue({ kind: 'external', path: '/workspace/other' })
    await expect(f.call(channels.gitReset, { commit: hash, mode: 'hard' })).rejects.toThrow(
      'Workspace changed',
    )
    expect(f.git.reset).not.toHaveBeenCalled()
    expect(f.workspace.flushBuffers).not.toHaveBeenCalled()
  })

  it('rejects a workspace switch while the mutation is queued', async () => {
    const f = fixture()
    f.coordinator.runMutation.mockImplementationOnce(async (_root, work) => {
      f.workspace.rootInfo.mockReturnValue({ kind: 'external', path: '/workspace/new' })
      return work()
    })
    await expect(f.call(channels.gitBranchSwitch, { name: 'topic' })).rejects.toThrow(
      'Workspace changed',
    )
    expect(f.git.switchBranch).not.toHaveBeenCalled()
  })

  it('invalidates changed files even when merge resolution fails', async () => {
    const f = fixture()
    f.git.continueOperation.mockRejectedValueOnce(new Error('conflicts remain'))
    await expect(f.call(channels.gitOperationContinue)).rejects.toThrow('conflicts remain')
    expect(f.workspace.invalidateAllExternalPaths).toHaveBeenCalledOnce()
  })

  it('never runs discard when saving editor buffers fails', async () => {
    const f = fixture()
    f.workspace.flushBuffers.mockRejectedValueOnce(new Error('save failed'))
    await expect(f.call(channels.gitDiscard, { paths: ['note.md'] })).rejects.toThrow('save failed')
    expect(f.git.discard).not.toHaveBeenCalled()
  })

  it('preserves the selected stash identity through the workspace boundary', async () => {
    const f = fixture()
    await f.call(channels.gitStashApply, { ref: 'stash@{0}', expectedHash: hash })
    expect(f.git.stashApply).toHaveBeenCalledWith(root, 'stash@{0}', hash)
    await expect(
      f.call(channels.gitStashApply, {
        ref: 'stash@{0}',
        expectedHash: 'bad',
      }),
    ).rejects.toThrow()
    expect(f.git.stashApply).toHaveBeenCalledOnce()
  })

  it.each([
    [channels.gitStage, { paths: [] }],
    [channels.gitRevert, { commit: 'a'.repeat(41) }],
    [channels.gitReset, { commit: hash, mode: '--hard' }],
    [channels.gitStashApply, { ref: '--all' }],
    [channels.gitBranchSwitch, { name: 'topic', shell: 'bad' }],
  ])('rejects malformed operation payload %s', async (channel, payload) => {
    const f = fixture()
    await expect(f.call(channel, payload)).rejects.toThrow()
    expect(f.coordinator.runMutation).not.toHaveBeenCalled()
  })

  it('binds historical diff reads to the sender workspace and passes rename paths', async () => {
    const f = fixture()
    await f.call(channels.gitCommitDiff, { commit: hash, path: 'new.md', oldPath: 'old.md' })
    expect(f.git.commitDiff).toHaveBeenCalledWith(root, hash, 'new.md', 'old.md')
    expect(f.workspace.flushBuffers).not.toHaveBeenCalled()
  })

  it('queries pending operation without writing or flushing files', async () => {
    const f = fixture()
    await expect(f.call(channels.gitOperationState)).resolves.toEqual({ operation: null })
    expect(f.git.operationState).toHaveBeenCalledWith(root)
    expect(f.workspace.runExternalWorkspaceMutation).not.toHaveBeenCalled()
  })
})
