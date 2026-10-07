import { describe, expect, it, vi } from 'vitest'

import { createManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager.testFixture'

describe('WorkspaceSidecarManager concurrency', () => {
  it('shares one in-flight runtime start between concurrent callers', async () => {
    const { child, client, manager, startSidecar } = createManager()
    const start = deferredStart(child, client)
    startSidecar.mockImplementation(() => start.request)

    const first = manager.open('workspace-a', 'index-a', { openWorkspace: false })
    const second = manager.open('workspace-a', 'index-a', { openWorkspace: false })
    await Promise.resolve()

    expect(startSidecar).toHaveBeenCalledTimes(1)
    start.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
    expect(client.getCapabilities).toHaveBeenCalledTimes(1)
  })

  it('upgrades an in-flight file-access prewarm when a full workspace open arrives', async () => {
    const { client, manager, startSidecar } = createManager()
    let finishCapabilities!: () => void
    vi.mocked(client.getCapabilities).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCapabilities = () => resolve({})
        }),
    )

    const prewarm = manager.open('workspace-a', 'index-a', { openWorkspace: false })
    await vi.waitFor(() => expect(client.getCapabilities).toHaveBeenCalledOnce())
    const fullOpen = manager.open('workspace-a', 'index-a')
    finishCapabilities()
    await Promise.all([prewarm, fullOpen])

    expect(startSidecar).toHaveBeenCalledOnce()
    expect(client.openWorkspace).toHaveBeenCalledExactlyOnceWith('index-a')
  })

  it('upgrades an already prewarmed runtime without starting another process', async () => {
    const { client, manager, startSidecar } = createManager()
    await manager.open('workspace-a', 'index-a', { openWorkspace: false })

    await manager.open('workspace-a', 'index-a')

    expect(startSidecar).toHaveBeenCalledOnce()
    expect(client.openWorkspace).toHaveBeenCalledExactlyOnceWith('index-a')
  })

  it('records cold runtime startup latency without logging workspace paths', async () => {
    const { loggerInfo, manager } = createManager()

    await manager.open('workspace-a', 'index-a', { openWorkspace: false })

    expect(loggerInfo).toHaveBeenCalledWith(
      'knowledge workspace runtime ready',
      expect.objectContaining({
        durationMs: expect.any(Number),
        openWorkspace: false,
        workspaceKey: expect.any(String),
      }),
    )
    expect(JSON.stringify(loggerInfo.mock.calls)).not.toContain('index-a')
  })

  it('cancels and disposes a runtime that finishes opening after the manager is cleared', async () => {
    const { child, client, manager, startSidecar } = createManager()
    const start = deferredStart(child, client)
    startSidecar.mockImplementation(() => start.request)
    const opening = manager.open('workspace-a', 'index-a', { openWorkspace: false })
    await Promise.resolve()

    manager.clear()
    start.resolve()

    await expect(opening).rejects.toThrow('opening was cancelled')
    expect(client.close).toHaveBeenCalledOnce()
    expect(child.kill).toHaveBeenCalledOnce()
    expect(manager.listActive()).toEqual([])
  })
})

const deferredStart = <TChild, TClient>(child: TChild, client: TClient) => {
  let finish!: (value: { address: string; child: TChild; client: TClient }) => void
  const request = new Promise<{ address: string; child: TChild; client: TClient }>((resolve) => {
    finish = resolve
  })
  return {
    request,
    resolve: () => finish({ address: '127.0.0.1:40101', child, client }),
  }
}
