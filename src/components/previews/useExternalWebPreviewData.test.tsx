import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExternalWebPreviewData } from '@/components/previews/useExternalWebPreviewData'

const native = vi.hoisted(() => ({
  capture: vi.fn(),
  fetch: vi.fn(),
  cancel: vi.fn(),
  promote: vi.fn(),
  unlisten: vi.fn(),
  receive: undefined as
    | undefined
    | ((event: {
        payload: {
          generation: number
          capture: { url: string; src: string; width: number; height: number }
        }
      }) => void),
}))
vi.mock('@/services/linkPreviewApi', () => ({ linkPreviewApi: native }))
vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async (_name, receive) => {
    native.receive = receive
    return native.unlisten
  }),
}))

const url = 'https://example.com/'
const frame = (src: string, target = url) => ({ url: target, src, width: 1920, height: 1080 })
const setup = (requested = true, target = url) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return {
    client,
    ...renderHook(
      () =>
        useExternalWebPreviewData({
          url: target,
          capturePriority: 'background',
          captureRequested: requested,
          metadataRequested: requested,
        }),
      { wrapper },
    ),
  }
}

describe('live web preview updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    native.receive = undefined
    native.fetch.mockResolvedValue({ kind: 'webpage', url })
    native.cancel.mockResolvedValue(undefined)
    native.promote.mockResolvedValue(undefined)
  })

  it('publishes the latest native frame and prevents an older pending worker from replacing it', async () => {
    let finish: ((value: ReturnType<typeof frame>) => void) | undefined
    native.capture.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const view = setup()
    await waitFor(() => expect(native.capture).toHaveBeenCalledOnce())
    act(() =>
      native.receive?.({
        payload: { capture: frame('unrelated', 'https://other.test/'), generation: 1 },
      }),
    )
    expect(view.result.current.capture.data).toBeUndefined()
    act(() => {
      native.receive?.({ payload: { capture: frame('native-first'), generation: 1 } })
      native.receive?.({ payload: { capture: frame('native-latest'), generation: 1 } })
    })
    await waitFor(() => expect(view.result.current.capture.data?.src).toBe('native-latest'))
    await act(async () => {
      finish?.(frame('old-static'))
    })
    expect(view.result.current.capture.data?.src).toBe('native-latest')
    expect(native.capture).toHaveBeenCalledOnce()
    view.unmount()
    expect(native.unlisten).toHaveBeenCalledOnce()
  })

  it('matches canonical native URLs to links without a trailing slash', async () => {
    const view = setup(false, 'https://example.com')
    await waitFor(() => expect(native.receive).toBeDefined())
    act(() => native.receive?.({ payload: { capture: frame('canonical-frame'), generation: 1 } }))
    await waitFor(() => expect(view.result.current.capture.data?.src).toBe('canonical-frame'))
    expect(native.capture).not.toHaveBeenCalled()
  })

  it('updates an offscreen preview without starting another capture or metadata request', async () => {
    const view = setup(false)
    await waitFor(() => expect(native.receive).toBeDefined())
    act(() =>
      native.receive?.({ payload: { capture: frame('ready-before-visible'), generation: 1 } }),
    )
    await waitFor(() => expect(view.result.current.capture.data?.src).toBe('ready-before-visible'))
    expect(native.capture).not.toHaveBeenCalled()
    expect(native.fetch).not.toHaveBeenCalled()
  })
})
