import { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { setWorkspaceRoot, setWorkspaceTarget } from '@electron/main/windowCommandTargets'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(), getFocusedWindow: vi.fn() },
}))

const createWorkspace = () => {
  const setRoot = vi.fn(async (value) => ({
    kind: value ? ('external' as const) : ('internal' as const),
    path: value?.path ?? '/internal',
  }))
  const setSingleFile = vi.fn(async (value) => ({
    kind: 'single' as const,
    path: value.path,
  }))
  return {
    service: { setRoot, setSingleFile } as unknown as WorkspaceService,
    setRoot,
    setSingleFile,
  }
}

describe('window command workspace targets', () => {
  it('routes every root kind with and without cancellation options', async () => {
    const { service, setRoot, setSingleFile } = createWorkspace()
    const options = { signal: new AbortController().signal }

    await setWorkspaceRoot(service, { kind: 'single', path: '/one.md' }, options)
    await setWorkspaceRoot(service, { kind: 'external', path: '/notes' }, options)
    await setWorkspaceRoot(service, { kind: 'internal', path: '/internal' }, options)
    await setWorkspaceRoot(service, { kind: 'single', path: '/two.md' })
    await setWorkspaceRoot(service, { kind: 'external', path: '/archive' })
    await setWorkspaceRoot(service, { kind: 'internal', path: '/internal' })

    expect(setSingleFile).toHaveBeenNthCalledWith(1, { path: '/one.md' }, options)
    expect(setSingleFile).toHaveBeenNthCalledWith(2, { path: '/two.md' })
    expect(setRoot).toHaveBeenNthCalledWith(1, { path: '/notes' }, options)
    expect(setRoot).toHaveBeenNthCalledWith(2, null, options)
    expect(setRoot).toHaveBeenNthCalledWith(3, { path: '/archive' })
    expect(setRoot).toHaveBeenNthCalledWith(4, null)
  })

  it('routes file and directory targets while preserving an AbortSignal', async () => {
    const { service, setRoot, setSingleFile } = createWorkspace()
    const options = { signal: new AbortController().signal }

    await setWorkspaceTarget(service, { kind: 'directory', path: '/notes' }, options)
    await setWorkspaceTarget(service, { kind: 'file', path: '/notes/a.md' }, options)
    await setWorkspaceTarget(service, { kind: 'directory', path: '/archive' })
    await setWorkspaceTarget(service, { kind: 'file', path: '/archive/a.md' })

    expect(setRoot).toHaveBeenNthCalledWith(1, { path: '/notes' }, options)
    expect(setRoot).toHaveBeenNthCalledWith(2, { path: '/archive' })
    expect(setSingleFile).toHaveBeenNthCalledWith(1, { path: '/notes/a.md' }, options)
    expect(setSingleFile).toHaveBeenNthCalledWith(2, { path: '/archive/a.md' })
  })

  it('selects invoking, focused, and primary windows in priority order', async () => {
    const { sourceWindowForEvent } = await import('@electron/main/windowCommandTargets')
    const invoking = { id: 1 } as BrowserWindow
    const focused = { id: 2 } as BrowserWindow
    const primary = { id: 3 } as BrowserWindow
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(invoking)
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(focused)

    expect(sourceWindowForEvent({ sender: {} } as never, primary)).toBe(invoking)
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null)
    expect(sourceWindowForEvent({ sender: {} } as never, primary)).toBe(focused)
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
    expect(sourceWindowForEvent(null, primary)).toBe(primary)
  })
})
