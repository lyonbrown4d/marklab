import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { registerLinkPreviewIpc } from '@electron/ipc/linkPreview'
import type { LinkPreviewServiceContract } from '@electron/services/linkPreview/service'

describe('link preview IPC', () => {
  it('registers a named handler and forwards a validated URL', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const sender = { id: 7, mainFrame: { routingId: 1 } }
    const workspaceRegistry = { serviceForWebContents: vi.fn(() => ({})) }
    const service = {
      fetch: vi.fn(async () => ({ kind: 'webpage', url: 'https://example.com' })),
    } as unknown as LinkPreviewServiceContract
    registerLinkPreviewIpc(
      {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler)
        },
      } as never,
      service,
      workspaceRegistry as never,
      {} as never,
    )

    await handlers.get(nativeIpcChannels.linkPreviewFetch)?.(
      { sender, senderFrame: sender.mainFrame },
      { url: 'https://example.com' },
    )

    expect(workspaceRegistry.serviceForWebContents).toHaveBeenCalledExactlyOnceWith(sender)
    expect(service.fetch).toHaveBeenCalledExactlyOnceWith({ url: 'https://example.com/' })
  })

  it('registers a separate visual capture handler at the same trusted boundary', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const sender = { id: 7, mainFrame: { routingId: 1 } }
    const workspaceRegistry = { serviceForWebContents: vi.fn(() => ({})) }
    const owner = { id: 4, isDestroyed: vi.fn(() => false) }
    const BrowserWindow = { fromWebContents: vi.fn(() => owner) }
    const service = {
      capture: vi.fn(async () => ({
        height: 360,
        src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        url: 'https://example.com/',
        width: 640,
      })),
      fetch: vi.fn(),
    } as unknown as LinkPreviewServiceContract
    registerLinkPreviewIpc(
      {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler)
        },
      } as never,
      service,
      workspaceRegistry as never,
      BrowserWindow as never,
    )

    await handlers.get(nativeIpcChannels.linkPreviewCapture)?.(
      { sender, senderFrame: sender.mainFrame },
      { url: 'https://example.com' },
    )

    expect(workspaceRegistry.serviceForWebContents).toHaveBeenCalledExactlyOnceWith(sender)
    expect(service.capture).toHaveBeenCalledExactlyOnceWith({ url: 'https://example.com/' }, owner)
  })

  it('rejects non-web URLs at the named IPC boundary', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const sender = { id: 7, mainFrame: { routingId: 1 } }
    const workspaceRegistry = { serviceForWebContents: vi.fn(() => ({})) }
    const service = { fetch: vi.fn() } as unknown as LinkPreviewServiceContract
    registerLinkPreviewIpc(
      {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
          handlers.set(channel, handler),
      } as never,
      service,
      workspaceRegistry as never,
      {} as never,
    )

    expect(() =>
      handlers.get(nativeIpcChannels.linkPreviewFetch)?.(
        { sender, senderFrame: sender.mainFrame },
        { url: 'file:///secret' },
      ),
    ).toThrow()
    expect(service.fetch).not.toHaveBeenCalled()
  })

  it('rejects requests from a child frame', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const sender = { id: 7, mainFrame: { routingId: 1 } }
    const workspaceRegistry = { serviceForWebContents: vi.fn(() => ({})) }
    const service = { fetch: vi.fn() } as unknown as LinkPreviewServiceContract
    registerLinkPreviewIpc(
      {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler)
        },
      } as never,
      service,
      workspaceRegistry as never,
      {} as never,
    )

    expect(() =>
      handlers.get(nativeIpcChannels.linkPreviewFetch)?.(
        { sender, senderFrame: { routingId: 2 } },
        { url: 'https://example.com' },
      ),
    ).toThrow('main frame')
    expect(workspaceRegistry.serviceForWebContents).not.toHaveBeenCalled()
    expect(service.fetch).not.toHaveBeenCalled()
  })

  it('rejects senders that are not bound to a Marklab window', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const sender = { id: 99, mainFrame: { routingId: 1 } }
    const workspaceRegistry = {
      serviceForWebContents: vi.fn(() => {
        throw new Error('No BrowserWindow owns the requesting WebContents')
      }),
    }
    const service = { fetch: vi.fn() } as unknown as LinkPreviewServiceContract
    registerLinkPreviewIpc(
      {
        handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
          handlers.set(channel, handler)
        },
      } as never,
      service,
      workspaceRegistry as never,
      {} as never,
    )

    expect(() =>
      handlers.get(nativeIpcChannels.linkPreviewFetch)?.(
        { sender, senderFrame: sender.mainFrame },
        { url: 'https://example.com' },
      ),
    ).toThrow('No BrowserWindow')
    expect(service.fetch).not.toHaveBeenCalled()
  })
})
