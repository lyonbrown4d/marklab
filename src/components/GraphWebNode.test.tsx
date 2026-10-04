import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebTabState } from '@/types/webTabs'

const capture = vi.hoisted(() => vi.fn())
const fetchPreview = vi.hoisted(() => vi.fn())
const openWebTab = vi.hoisted(() => vi.fn())
const nativeView = vi.hoisted(() => vi.fn())
const nativeSurfaceOccluded = vi.hoisted(() => ({ value: false }))
const reloadWebTab = vi.hoisted(() => vi.fn())
const nativeState = vi.hoisted(() => ({
  value: {
    active: true,
    canGoBack: false,
    canGoForward: false,
    status: 'ready',
    tabId: 'graph-web-node',
    title: 'Example',
    url: 'https://example.com/',
  } as WebTabState,
}))

vi.mock('@/services/linkPreviewApi', () => ({
  linkPreviewApi: { capture, fetch: fetchPreview },
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
      state: nativeState.value,
    }
  },
}))
vi.mock('@/pages/web/useWebTabActions', () => ({
  useWebTabActions: () => ({ reload: reloadWebTab }),
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, variables?: { title?: string }) =>
      key === 'preview.externalVisualAlt' ? `${variables?.title} preview` : key,
  }),
}))

import { GraphWebNode } from '@/components/GraphWebNode'

const renderNode = (props: Partial<React.ComponentProps<typeof GraphWebNode>> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onActivate = vi.fn()
  const onDeactivate = vi.fn()
  const view = render(
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
  return { onActivate, onDeactivate, view }
}

describe('GraphWebNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    nativeSurfaceOccluded.value = false
    nativeState.value = {
      active: true,
      canGoBack: false,
      canGoForward: false,
      status: 'ready',
      tabId: 'graph-web-node',
      title: 'Example',
      url: 'https://example.com/',
    }
    capture.mockResolvedValue({
      height: 360,
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/',
      width: 640,
    })
    fetchPreview.mockResolvedValue({
      canonical: null,
      description: 'Current description',
      favicon: null,
      image: null,
      kind: 'webpage',
      site_name: 'Example Site',
      title: 'Current page title',
      url: 'https://example.com/',
    })
  })

  it('shows a cached visual preview and enters the single live slot on demand', async () => {
    const { onActivate } = renderNode()

    expect(await screen.findByRole('img', { name: 'Example preview' })).toHaveAttribute(
      'src',
      'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(await screen.findByText('Current page title')).toBeVisible()
    expect(fetchPreview).toHaveBeenCalledExactlyOnceWith('https://example.com/')
    fireEvent.click(screen.getByRole('button', { name: 'graph.web.interact' }))

    expect(onActivate).toHaveBeenCalledExactlyOnceWith('ext:https://example.com/')
    expect(nativeView).not.toHaveBeenCalled()
  })

  it('keeps the live interaction action when the URL resolves to an image', async () => {
    fetchPreview.mockResolvedValue({
      kind: 'image',
      media_type: 'image/png',
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/image.png',
    })
    const { onActivate } = renderNode({ url: 'https://example.com/image.png' })

    expect(await screen.findByRole('img', { name: 'Example' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'graph.web.interact' }))

    expect(onActivate).toHaveBeenCalledExactlyOnceWith('ext:https://example.com/')
  })

  it('isolates retry controls from graph drag and pan gestures', async () => {
    capture.mockRejectedValue(new Error('capture unavailable'))
    fetchPreview.mockRejectedValue(new Error('metadata unavailable'))
    renderNode()

    const retry = await screen.findByRole('button', { name: 'actions.retry' })

    expect(retry.closest('[role="alert"]')).toHaveClass('nodrag', 'nopan')
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
    expect(screen.getByText('Example').closest('.nodrag')).toBeNull()
    expect(document.querySelector('[aria-busy]')).toHaveClass('m-2')
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

  it('shows loading and retryable failure states inside the live node', () => {
    nativeState.value = { ...nativeState.value, active: false, status: 'loading' }
    const loading = renderNode({ active: true })
    expect(screen.getByText('webTab.loading')).toBeVisible()
    loading.onDeactivate.mockClear()

    nativeState.value = {
      ...nativeState.value,
      error: { description: 'network unavailable' },
      status: 'error',
    }
    loading.view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <GraphWebNode
          active
          id="ext:https://example.com/"
          label="Example"
          onActivate={vi.fn()}
          onDeactivate={loading.onDeactivate}
          selected={false}
          url="https://example.com/"
        />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('network unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'webTab.retry' }))
    expect(reloadWebTab).toHaveBeenCalledOnce()
  })
})
