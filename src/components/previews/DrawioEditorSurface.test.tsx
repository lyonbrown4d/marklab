import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DrawioEditorSurface from '@/components/previews/DrawioEditorSurface'
import { DEFAULT_DRAWIO_EMBED_URL } from '@/logic/drawioEmbed'
import { fsApi } from '@/services/fsApi'
import { useDrawioSettingsStore } from '@/store/useDrawioSettingsStore'

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    flushBuffers: vi.fn(),
    openPathInSystem: vi.fn(),
    readFile: vi.fn(),
    updateBuffer: vi.fn(),
  },
}))

const renderSurface = ({ readonly = false }: { readonly?: boolean } = {}) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <DrawioEditorSurface path="diagrams/flow.drawio" readonly={readonly} title="flow.drawio" />
    </QueryClientProvider>,
  )
}

const drawioMessage = (
  iframe: HTMLIFrameElement,
  payload: Record<string, unknown>,
  origin = 'https://embed.diagrams.net',
) => {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify(payload),
      origin,
      source: iframe.contentWindow,
    }),
  )
}

describe('DrawioEditorSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fsApi.readFile).mockResolvedValue('<mxfile />')
    vi.mocked(fsApi.updateBuffer).mockResolvedValue({
      dirty: true,
      path: 'diagrams/flow.drawio',
      revision: 1,
    })
    vi.mocked(fsApi.flushBuffers).mockResolvedValue(1)
    useDrawioSettingsStore.setState({
      drawioEditorMode: 'remote',
      drawioEmbedUrl: DEFAULT_DRAWIO_EMBED_URL,
    })
  })

  it('loads the current drawio xml into the remote iframe after init', async () => {
    renderSurface()
    const iframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage')

    drawioMessage(iframe, { event: 'init' })

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.stringContaining('"action":"load"'),
        'https://embed.diagrams.net',
      )
    })
    expect(postMessage.mock.calls[0]?.[0]).toContain('<mxfile />')
  })

  it('announces the loading overlay without a duplicate spinner status', () => {
    vi.mocked(fsApi.readFile).mockReturnValue(new Promise<string>(() => undefined))

    renderSurface()

    const loadingStatus = screen.getByRole('status', {
      name: /Reading diagram file|正在读取图表文件/,
    })
    expect(loadingStatus).toHaveAttribute('aria-busy', 'true')
    expect(loadingStatus.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('uses badges for save and read-only editor states', () => {
    const { container, rerender } = renderSurface()

    const saveBadge = container.querySelector('[data-save-state="clean"]')
    expect(saveBadge).toHaveTextContent(/Saved|已保存/)

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    rerender(
      <QueryClientProvider client={client}>
        <DrawioEditorSurface path="diagrams/flow.drawio" readonly title="flow.drawio" />
      </QueryClientProvider>,
    )

    const readOnlyBadge = screen.getByText(/Read-only|只读/).closest('div')
    expect(readOnlyBadge?.querySelector('[data-icon="inline-start"]')).not.toBeNull()
  })

  it('flushes workspace buffers when the iframe sends exported xml', async () => {
    renderSurface()
    const iframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement

    drawioMessage(iframe, {
      event: 'export',
      xml: '<mxfile>saved</mxfile>',
    })

    await waitFor(() => {
      expect(fsApi.updateBuffer).toHaveBeenCalledWith(
        'diagrams/flow.drawio',
        '<mxfile>saved</mxfile>',
      )
    })
    expect(fsApi.flushBuffers).toHaveBeenCalled()
  })

  it('ignores messages from other origins', async () => {
    renderSurface()
    const iframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement

    drawioMessage(
      iframe,
      {
        event: 'save',
        xml: '<mxfile>evil</mxfile>',
      },
      'https://example.test',
    )

    expect(fsApi.updateBuffer).not.toHaveBeenCalled()
  })
})
