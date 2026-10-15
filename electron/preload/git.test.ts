import { describe, expect, it, vi } from 'vitest'
import { createGitPreloadSurface } from '@electron/preload/git'
import { nativeIpcChannels as channels } from '@electron/channels'

describe('named Git preload', () => {
  it('preserves legacy payloads while binding new actions to a workspace', async () => {
    const invoke = vi.fn(async () => ({}))
    const api = createGitPreloadSurface({ invoke })
    await api.status()
    expect(invoke).toHaveBeenLastCalledWith(channels.gitStatus)
    await api.stage(['note.md'], '/workspace')
    expect(invoke).toHaveBeenLastCalledWith(channels.gitStage, {
      paths: ['note.md'],
      expectedRoot: '/workspace',
    })
    await api.reset('a'.repeat(40), 'soft', '/workspace')
    expect(invoke).toHaveBeenLastCalledWith(channels.gitReset, {
      commit: 'a'.repeat(40),
      mode: 'soft',
      expectedRoot: '/workspace',
    })
    expect(Object.keys(api)).not.toContain('invoke')
  })
  it('binds stash selections to both workspace and immutable identity', async () => {
    const invoke = vi.fn(async () => ({}))
    const api = createGitPreloadSurface({ invoke })
    await api.dropStash('stash@{0}', '/workspace', 'b'.repeat(40))
    expect(invoke).toHaveBeenLastCalledWith(channels.gitStashDrop, {
      ref: 'stash@{0}',
      expectedRoot: '/workspace',
      expectedHash: 'b'.repeat(40),
    })
  })
})
