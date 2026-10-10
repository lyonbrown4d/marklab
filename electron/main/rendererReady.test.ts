import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { createRendererReadyCoordinator } from '@electron/main/rendererReady'

const createWindow = (id: number) =>
  ({ id, isDestroyed: () => false, webContents: { id: id * 10 } }) as unknown as BrowserWindow

describe('renderer ready coordinator', () => {
  it('keeps the primary splash visible until workspace content is interactive', () => {
    const primary = createWindow(1)
    const onPrimaryWorkspaceSettled = vi.fn()
    const options = {
      fromWebContents: vi.fn(() => primary),
      getPrimaryWindow: () => primary,
      getWindowPool: () => ({
        markRendererInteractive: vi.fn(),
        prewarmMainWindow: vi.fn(async () => undefined),
      }),
      getWorkspaceServiceForWindow: () => ({ markRendererInteractive: vi.fn() }),
      isPrimaryBootstrapping: () => false,
      logger: { warn: vi.fn() },
      onPrimaryWorkspaceSettled,
    }
    const coordinator = createRendererReadyCoordinator(options)
    const event = { sender: primary.webContents } as IpcMainInvokeEvent

    coordinator.handle(event, { phase: 'shell' })
    expect(onPrimaryWorkspaceSettled).not.toHaveBeenCalled()

    coordinator.handle(event, { phase: 'workspace-interactive' })
    expect(onPrimaryWorkspaceSettled).toHaveBeenCalledOnce()
  })

  it('releases the primary splash when workspace hydration fails', () => {
    const primary = createWindow(1)
    const onPrimaryWorkspaceSettled = vi.fn()
    const coordinator = createRendererReadyCoordinator({
      fromWebContents: vi.fn(() => primary),
      getPrimaryWindow: () => primary,
      getWindowPool: () => ({
        markRendererInteractive: vi.fn(),
        prewarmMainWindow: vi.fn(async () => undefined),
      }),
      getWorkspaceServiceForWindow: () => ({ markRendererInteractive: vi.fn() }),
      isPrimaryBootstrapping: () => false,
      logger: { warn: vi.fn() },
      onPrimaryWorkspaceSettled,
    })

    coordinator.handle({ sender: primary.webContents } as IpcMainInvokeEvent, {
      error: 'workspace unavailable',
      phase: 'workspace-error',
    })

    expect(onPrimaryWorkspaceSettled).toHaveBeenCalledOnce()
  })

  it('ignores standby shell readiness for primary splash semantics', () => {
    const primary = createWindow(1)
    const standby = createWindow(2)
    const onPrimaryWorkspaceSettled = vi.fn()
    const coordinator = createRendererReadyCoordinator({
      fromWebContents: vi.fn(() => standby),
      getPrimaryWindow: () => primary,
      getWindowPool: vi.fn(),
      getWorkspaceServiceForWindow: vi.fn(),
      isPrimaryBootstrapping: () => false,
      logger: { warn: vi.fn() },
      onPrimaryWorkspaceSettled,
    })

    coordinator.handle({ sender: standby.webContents } as IpcMainInvokeEvent, {
      phase: 'shell',
    })

    expect(onPrimaryWorkspaceSettled).not.toHaveBeenCalled()
  })

  it('starts initial prewarm only after the primary workspace is interactive', async () => {
    const primary = createWindow(1)
    const pool = {
      markRendererInteractive: vi.fn(),
      prewarmMainWindow: vi.fn(async () => undefined),
    }
    const workspace = { markRendererInteractive: vi.fn() }
    const onPrimaryWorkspaceSettled = vi.fn()
    const coordinator = createRendererReadyCoordinator({
      fromWebContents: vi.fn(() => primary),
      getPrimaryWindow: () => primary,
      getWindowPool: () => pool,
      getWorkspaceServiceForWindow: () => workspace,
      isPrimaryBootstrapping: () => false,
      logger: { warn: vi.fn() },
      onPrimaryWorkspaceSettled,
    })
    const event = { sender: primary.webContents } as IpcMainInvokeEvent

    coordinator.handle(event, { phase: 'shell' })
    expect(onPrimaryWorkspaceSettled).not.toHaveBeenCalled()
    expect(pool.prewarmMainWindow).not.toHaveBeenCalled()

    coordinator.handle(event, { phase: 'workspace-interactive' })
    await vi.waitFor(() => expect(pool.prewarmMainWindow).toHaveBeenCalledOnce())
    expect(onPrimaryWorkspaceSettled).toHaveBeenCalledOnce()
    expect(pool.markRendererInteractive).toHaveBeenCalledWith(primary, undefined)
    expect(workspace.markRendererInteractive).toHaveBeenCalledOnce()

    coordinator.handle(event, { phase: 'workspace-interactive' })
    await vi.waitFor(() => expect(workspace.markRendererInteractive).toHaveBeenCalledTimes(2))
    expect(pool.prewarmMainWindow).toHaveBeenCalledOnce()
  })

  it('releases hydration for a secondary current-window root switch only when interactive', () => {
    const primary = createWindow(1)
    const secondary = createWindow(2)
    const pool = {
      markRendererInteractive: vi.fn(),
      prewarmMainWindow: vi.fn(async () => undefined),
    }
    const workspace = { markRendererInteractive: vi.fn() }
    const coordinator = createRendererReadyCoordinator({
      fromWebContents: () => secondary,
      getPrimaryWindow: () => primary,
      getWindowPool: () => pool,
      getWorkspaceServiceForWindow: () => workspace,
      isPrimaryBootstrapping: () => false,
      logger: { warn: vi.fn() },
      onPrimaryWorkspaceSettled: vi.fn(),
    })
    const event = { sender: secondary.webContents } as IpcMainInvokeEvent

    coordinator.handle(event, { error: 'root switch failed', phase: 'workspace-error' })
    expect(workspace.markRendererInteractive).not.toHaveBeenCalled()

    coordinator.handle(event, { phase: 'workspace-interactive' })

    expect(workspace.markRendererInteractive).toHaveBeenCalledOnce()
    expect(pool.prewarmMainWindow).not.toHaveBeenCalled()
  })

  it('handles a replacement primary after every window has closed', async () => {
    const first = createWindow(1)
    const second = createWindow(2)
    let primary = first
    let senderWindow = first
    const pool = {
      markRendererInteractive: vi.fn(),
      prewarmMainWindow: vi.fn(async () => undefined),
    }
    const workspace = { markRendererInteractive: vi.fn() }
    const coordinator = createRendererReadyCoordinator({
      fromWebContents: () => senderWindow,
      getPrimaryWindow: () => primary,
      getWindowPool: () => pool,
      getWorkspaceServiceForWindow: () => workspace,
      isPrimaryBootstrapping: () => false,
      logger: { warn: vi.fn() },
      onPrimaryWorkspaceSettled: vi.fn(),
    })

    coordinator.handle({ sender: first.webContents } as IpcMainInvokeEvent, {
      phase: 'workspace-interactive',
    })
    primary = second
    senderWindow = second
    coordinator.handle({ sender: second.webContents } as IpcMainInvokeEvent, {
      phase: 'workspace-interactive',
    })

    await vi.waitFor(() => expect(pool.prewarmMainWindow).toHaveBeenCalledTimes(2))
    expect(workspace.markRendererInteractive).toHaveBeenCalledTimes(2)
  })

  it('flushes interactive readiness reported before primary assignment', async () => {
    const bootstrapping = createWindow(1)
    let primary: BrowserWindow | null = null
    const pool = {
      markRendererInteractive: vi.fn(),
      prewarmMainWindow: vi.fn(async () => undefined),
    }
    const workspace = { markRendererInteractive: vi.fn() }
    const coordinator = createRendererReadyCoordinator({
      fromWebContents: () => bootstrapping,
      getPrimaryWindow: () => primary,
      getWindowPool: () => pool,
      getWorkspaceServiceForWindow: () => workspace,
      isPrimaryBootstrapping: () => primary === null,
      logger: { warn: vi.fn() },
      onPrimaryWorkspaceSettled: vi.fn(),
    })

    coordinator.handle({ sender: bootstrapping.webContents } as IpcMainInvokeEvent, {
      phase: 'workspace-interactive',
    })
    expect(pool.prewarmMainWindow).not.toHaveBeenCalled()

    primary = bootstrapping
    coordinator.flushPrimaryInteractive()

    await vi.waitFor(() => expect(pool.prewarmMainWindow).toHaveBeenCalledOnce())
    expect(workspace.markRendererInteractive).toHaveBeenCalledOnce()
  })
})
