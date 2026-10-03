import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { registerLinkPreviewIpc } from '@electron/ipc/linkPreview.js'
import type { LinkPreviewServiceContract } from '@electron/services/linkPreview/service.js'

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
    )

    await handlers.get(nativeIpcChannels.linkPreviewFetch)?.(
      { sender, senderFrame: sender.mainFrame },
      { url: 'https://example.com' },
    )

    expect(workspaceRegistry.serviceForWebContents).toHaveBeenCalledExactlyOnceWith(sender)
    expect(service.fetch).toHaveBeenCalledExactlyOnceWith({ url: 'https://example.com/' })
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
