import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { createWorkspacePreloadSurfaces } from '@electron/preload/workspaceApi.js'

describe('workspace preload surfaces', () => {
  it('uses dedicated channels for workspace assets', async () => {
    const ipcRenderer = {
      invoke: vi
        .fn()
        .mockResolvedValueOnce({
          url: 'marklab-asset://local/v1/token',
          expires_at_ms: Date.now() + 1_000,
        })
        .mockResolvedValueOnce({ bytes: new ArrayBuffer(2), size_bytes: 2 }),
    }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await surfaces.assets.issueCapability({ path: 'images/file.png' })
    await surfaces.assets.readBytes({ asset_url: 'asset://token/file.png' })

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, nativeIpcChannels.assetsIssueCapability, {
      path: 'images/file.png',
    })
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, nativeIpcChannels.assetsReadBytes, {
      asset_url: 'asset://token/file.png',
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

  it('rejects malformed native responses', async () => {
    const ipcRenderer = { invoke: vi.fn(async () => ({ ok: false })) }
    const surfaces = createWorkspacePreloadSurfaces(ipcRenderer as never)

    await expect(surfaces.workspace.openPathInSystem('notes/today.md')).rejects.toThrow(
      'Invalid workspace.openPathInSystem response',
    )
  })
})
