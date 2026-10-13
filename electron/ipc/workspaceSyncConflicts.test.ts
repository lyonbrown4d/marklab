import { describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import { registerWorkspaceSyncIpc } from '@electron/ipc/workspaceSync'

const request = {
  rootPath: '/notes',
  path: 'note.md',
  binding: { profileId: 'cloud', remoteRoot: '/documents' },
}
const createFixture = () => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
  const workspace = { rootInfo: () => ({ kind: 'external', path: '/notes' }) }
  const sender = { mainFrame: {}, once: vi.fn() }
  const event = { sender, senderFrame: sender.mainFrame }
  const syncService = {
    listConflicts: vi.fn(async () => ({ conflicts: [], binding: request.binding })),
    readConflict: vi.fn(async () => ({ ok: true })),
    resolveConflict: vi.fn(async () => ({ ok: true })),
  }
  registerWorkspaceSyncIpc(
    {
      handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) =>
        handlers.set(channel, handler),
    } as never,
    { syncService, workspaceRegistry: { serviceForWebContents: vi.fn(() => workspace) } } as never,
  )
  return { event, handlers, workspace, syncService }
}

describe('sync conflict IPC authorization and validation', () => {
  it('uses the sender-owned workspace for listing and comparison', async () => {
    const fixture = createFixture()
    await fixture.handlers.get(nativeIpcChannels.syncConflictsList)?.(fixture.event, {
      rootPath: '/notes',
    })
    await fixture.handlers.get(nativeIpcChannels.syncConflictRead)?.(fixture.event, request)
    expect(fixture.syncService.listConflicts).toHaveBeenCalledWith(fixture.workspace, '/notes')
    expect(fixture.syncService.readConflict).toHaveBeenCalledWith(fixture.workspace, request)
  })

  it('passes a deliberate typed decision and propagates stale failures', async () => {
    const fixture = createFixture()
    const resolution = {
      ...request,
      choice: 'local',
      expectedLocalHash: 'a'.repeat(64),
      expectedRemoteHash: null,
      confirmDelete: true,
    }
    await fixture.handlers.get(nativeIpcChannels.syncConflictResolve)?.(fixture.event, resolution)
    expect(fixture.syncService.resolveConflict).toHaveBeenCalledWith(fixture.workspace, resolution)
    fixture.syncService.resolveConflict.mockRejectedValueOnce(new Error('Conflict version changed'))
    await expect(
      fixture.handlers.get(nativeIpcChannels.syncConflictResolve)?.(fixture.event, resolution),
    ).rejects.toThrow('changed')
  })

  it('rejects subframes and untyped or missing decision fields', () => {
    const fixture = createFixture()
    for (const channel of [
      nativeIpcChannels.syncConflictsList,
      nativeIpcChannels.syncConflictRead,
      nativeIpcChannels.syncConflictResolve,
    ]) {
      expect(() =>
        fixture.handlers.get(channel)?.({ ...fixture.event, senderFrame: {} }, request),
      ).toThrow('main workspace frame')
    }
    expect(() =>
      fixture.handlers.get(nativeIpcChannels.syncConflictRead)?.(fixture.event, {
        ...request,
        absolutePath: '/etc/passwd',
      }),
    ).toThrow()
    expect(() =>
      fixture.handlers.get(nativeIpcChannels.syncConflictResolve)?.(fixture.event, {
        ...request,
        choice: 'local',
      }),
    ).toThrow()
    expect(fixture.syncService.resolveConflict).not.toHaveBeenCalled()
    expect(fixture.syncService.readConflict).not.toHaveBeenCalled()
  })
})
