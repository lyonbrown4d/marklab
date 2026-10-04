import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const capture = vi.hoisted(() => vi.fn())
const openWebTab = vi.hoisted(() => vi.fn())
const nativeView = vi.hoisted(() => vi.fn())
const nativeSurfaceOccluded = vi.hoisted(() => ({ value: false }))

vi.mock('@/services/linkPreviewApi', () => ({
  linkPreviewApi: { capture, fetch: vi.fn() },
}))
vi.mock('@/app/useOpenWebTab', () => ({ useOpenWebTab: () => openWebTab }))
vi.mock('@/app/nativeSurfaceOcclusion', () => ({
  useNativeSurfaceOccluded: () => nativeSurfaceOccluded.value,
}))
vi.mock('@/pages/web/useWebTabNativeView', () => ({
  useWebTabNativeView: (options: unknown) => {
    nativeView(options)
    return {
      hostRef: vi.fn(),
      state: {
        active: true,
        canGoBack: false,
        canGoForward: false,
        status: 'ready',
        tabId: 'graph-web-node',
        title: 'Example',
        url: 'https://example.com/',
      },
    }
  },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

import { GraphWebNode } from '@/components/GraphWebNode'

const renderNode = (props: Partial<React.ComponentProps<typeof GraphWebNode>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onActivate = vi.fn()
  const onDeactivate = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <GraphWebNode
        active={false}
        id="ext:https://example.com/"
        label="Example"
        onActivate={onActivate}
        onDeactivate={onDeactivate}
        selected={false}
        subtitle="example.com"
        url="https://example.com/"
        {...props}
      />
    </QueryClientProvider>,
  )
  return { onActivate, onDeactivate }
}

describe('GraphWebNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nativeSurfaceOccluded.value = false
    capture.mockResolvedValue({
      height: 360,
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/',
      width: 640,
    })
  })

  it('shows a cached visual preview and enters the single live slot on demand', async () => {
    const { onActivate } = renderNode()

    expect(await screen.findByRole('img', { name: 'Example' })).toHaveAttribute(
      'src',
      'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    fireEvent.click(screen.getByRole('button', { name: 'graph.web.interact' }))

    expect(onActivate).toHaveBeenCalledExactlyOnceWith('ext:https://example.com/')
    expect(nativeView).not.toHaveBeenCalled()
  })

  it('mounts the pooled native surface only for the active node and can exit interaction', () => {
    const { onDeactivate } = renderNode({ active: true, selected: true })

    expect(nativeView).toHaveBeenCalledWith(
      expect.objectContaining({
        suspended: false,
        tab: expect.objectContaining({
          id: 'graph-web-node',
          kind: 'web',
          url: 'https://example.com/',
        }),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'graph.web.stop' }))
    expect(onDeactivate).toHaveBeenCalledOnce()
  })

  it('suspends the native surface while an app overlay occludes it', () => {
    nativeSurfaceOccluded.value = true

    renderNode({ active: true })

    expect(nativeView).toHaveBeenCalledWith(
      expect.objectContaining({
        suspended: true,
      }),
    )
  })

  it('promotes popup requests from the live node into a normal web tab', () => {
    renderNode({ active: true })
    const options = nativeView.mock.calls.at(-1)?.[0] as {
      onOpenRequested: (url: string) => void
    }

    options.onOpenRequested('https://example.com/reference')

    expect(openWebTab).toHaveBeenCalledWith('https://example.com/reference', 'Example')
  })
})
