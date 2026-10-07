import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { createWorkspacePreloadSurfaces } from '@electron/preload/workspaceApi'

describe('workspace preload surfaces', () => {
  it('uses dedicated channels for workspace assets', async () => {
    const ipcRenderer = {
      invoke: vi.fn().mockResolvedValueOnce({
        url: 'marklab-asset://local/v1/token',
        expires_at_ms: Date.now() + 1_000,
      }),
    }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await surfaces.assets.issueCapability({ path: 'images/file.png' })

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, nativeIpcChannels.assetsIssueCapability, {
      path: 'images/file.png',
    })
  })

  it('uses dedicated channels for workspace path operations', async () => {
    const ipcRenderer = { invoke: vi.fn(async () => ({ ok: true })) }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await surfaces.workspace.openPathInSystem('notes/today.md')
    await surfaces.workspace.revealPathInSystem('notes/today.md')
    await surfaces.workspace.copyAbsolutePathToClipboard('notes/today.md')

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      1,
      nativeIpcChannels.workspaceOpenPathInSystem,
      { path: 'notes/today.md' },
    )
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2,
      nativeIpcChannels.workspaceRevealPathInSystem,
      { path: 'notes/today.md' },
    )
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      3,
      nativeIpcChannels.workspaceCopyAbsolutePath,
      { path: 'notes/today.md' },
    )
  })

  it('uses a dedicated validated channel for bounded text previews', async () => {
    const ipcRenderer = {
      invoke: vi.fn(async () => ({ content: 'const value = 1', truncated: true })),
    }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await expect(surfaces.workspace.readTextPreview('src/example.ts', 16_384)).resolves.toEqual({
      content: 'const value = 1',
      truncated: true,
    })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(nativeIpcChannels.workspaceReadTextPreview, {
      limit_bytes: 16_384,
      path: 'src/example.ts',
    })
  })

  it('uses dedicated validated channels for bounded workspace tree queries', async () => {
    const ipcRenderer = {
      invoke: vi
        .fn()
        .mockResolvedValueOnce({
          entries: [{ kind: 'file', name: 'note.md', path: 'note.md', hasChildren: false }],
          nextCursor: null,
          parent: '',
          generation: 1,
          revision: 4,
          root: { kind: 'external', path: '/workspace' },
        })
        .mockResolvedValueOnce({
          existing: ['note.md'],
          generation: 1,
          revision: 4,
          root: { kind: 'external', path: '/workspace' },
        })
        .mockResolvedValueOnce({
          generation: 1,
          path: 'note.md',
          revision: 4,
          root: { kind: 'external', path: '/workspace' },
        }),
      on: vi.fn(),
      removeListener: vi.fn(),
    }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await surfaces.workspaceTree.listChildren({ parent: null, limit: 64 })
    await surfaces.workspaceTree.pathsExist({ paths: ['note.md'] })
    await surfaces.workspaceTree.initialFile()

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      1,
      nativeIpcChannels.workspaceTreeListChildren,
      { parent: null, limit: 64 },
    )
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2,
      nativeIpcChannels.workspaceTreePathsExist,
      { paths: ['note.md'] },
    )
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      3,
      nativeIpcChannels.workspaceTreeInitialFile,
    )
  })

  it('validates tree change events before delivering them to the renderer', () => {
    const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
    const ipcRenderer = {
      invoke: vi.fn(),
      on: vi.fn((channel: string, listener: (_event: unknown, payload: unknown) => void) => {
        listeners.set(channel, listener)
      }),
      removeListener: vi.fn(),
    }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)
    const handler = vi.fn()
    surfaces.workspaceTree.onChanged(handler)
    const listener = listeners.get(nativeIpcChannels.workspaceTreeChanged)

    listener?.({}, { kind: 'invalidated', previousRevision: 1, revision: 3, root: {} })
    listener?.(
      {},
      {
        kind: 'invalidated',
        generation: 1,
        previousRevision: 1,
        revision: 2,
        root: { kind: 'external', path: '/workspace' },
      },
    )

    expect(handler).toHaveBeenCalledOnce()
  })

  it('rejects malformed native responses', async () => {
    const ipcRenderer = { invoke: vi.fn(async () => ({ ok: false })) }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await expect(surfaces.workspace.openPathInSystem('notes/today.md')).rejects.toThrow(
      'Invalid workspace.openPathInSystem response',
    )
  })

  it('rejects malformed text preview responses', async () => {
    const ipcRenderer = { invoke: vi.fn(async () => ({ content: 42, truncated: false })) }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await expect(surfaces.workspace.readTextPreview('src/example.ts', 1024)).rejects.toThrow(
      'Invalid workspace.readTextPreview response',
    )
  })
})
