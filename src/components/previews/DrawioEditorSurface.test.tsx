import { readPreviewTextAsset } from '@/services/readPreviewAsset'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DrawioEditorSurface from '@/components/previews/DrawioEditorSurface'
import { DEFAULT_DRAWIO_EMBED_URL } from '@/logic/drawioEmbed'
import { fsApi } from '@/services/fsApi'
import { useDrawioSettingsStore } from '@/store/useDrawioSettingsStore'
import { ActiveWorkspaceProvider } from '@/app/AppCachedOutlet'
import { toast } from 'sonner'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('@/services/readPreviewAsset', () => ({ readPreviewTextAsset: vi.fn() }))

const workspaceIdentity = vi.hoisted(() => ({ rootKind: 'external', rootPath: 'C:/one' }))

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: unknown) => unknown) => selector(workspaceIdentity),
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    flushBuffers: vi.fn(),
    openPathInSystem: vi.fn(),
    readFile: vi.fn(),
    openBufferSnapshot: vi.fn(),
    updateBuffer: vi.fn(),
  },
}))

const renderSurface = ({
  activeWorkspaceKey = 'external:C:/one',
  readonly = false,
}: { activeWorkspaceKey?: string; readonly?: boolean } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <ActiveWorkspaceProvider value={activeWorkspaceKey}>
        <DrawioEditorSurface path="diagrams/flow.drawio" readonly={readonly} title="flow.drawio" />
      </ActiveWorkspaceProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
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
  it('reads immutable snapshot content instead of the same-named worktree file', async () => {
    useDrawioSettingsStore.setState({
      drawioEditorMode: 'remote',
      drawioEmbedUrl: DEFAULT_DRAWIO_EMBED_URL,
    })
    vi.mocked(readPreviewTextAsset).mockResolvedValue({
      content: '<mxfile>Historical diagram</mxfile>',
      truncated: false,
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const src = 'marklab-asset://local/v1/' + 'a'.repeat(43)
    const openVersion = vi.fn()
    render(
      <QueryClientProvider client={client}>
        <DrawioEditorSurface
          path="same.drawio"
          title="same.drawio"
          readonly
          src={src}
          onOpenInSystem={openVersion}
        />
      </QueryClientProvider>,
    )
    await screen.findByTitle(/same\.drawio/)
    await waitFor(() => expect(readPreviewTextAsset).toHaveBeenCalled())
    expect(fsApi.readFile).not.toHaveBeenCalled()
    act(() => useDrawioSettingsStore.setState({ drawioEditorMode: 'system' }))
    fireEvent.click(await screen.findByRole('button', { name: /Open in system|系统/ }))
    expect(openVersion).toHaveBeenCalledOnce()
    expect(fsApi.openPathInSystem).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    workspaceIdentity.rootKind = 'external'
    workspaceIdentity.rootPath = 'C:/one'
    vi.clearAllMocks()
    vi.mocked(fsApi.openPathInSystem).mockResolvedValue({ ok: true, path: 'same.drawio' })
    vi.mocked(fsApi.openBufferSnapshot).mockImplementation(async (path: string) => ({
      content: await fsApi.readFile(path),
      path,
      revision: 0,
      dirty: false,
      session_generation: 1,
    }))
    vi.mocked(fsApi.readFile).mockResolvedValue('<mxfile />')
    vi.mocked(fsApi.updateBuffer).mockResolvedValue({
      dirty: true,
      path: 'diagrams/flow.drawio',
      revision: 1,
      session_generation: 1,
    })
    vi.mocked(fsApi.flushBuffers).mockResolvedValue(1)
    useDrawioSettingsStore.setState({
      drawioEditorMode: 'remote',
      drawioEmbedUrl: DEFAULT_DRAWIO_EMBED_URL,
    })
  })

  it('isolates document queries and iframe sessions by workspace identity', async () => {
    const view = renderSurface()
    const oldIframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement
    await waitFor(() => expect(fsApi.readFile).toHaveBeenCalledTimes(1))
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toContainEqual(['drawio-document', 'external', 'C:/one', 'diagrams/flow.drawio'])

    workspaceIdentity.rootPath = 'D:/two'
    view.rerender(
      <QueryClientProvider client={view.client}>
        <DrawioEditorSurface path="diagrams/flow.drawio" readonly={false} title="flow.drawio" />
      </QueryClientProvider>,
    )
    const currentIframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement
    await waitFor(() => expect(fsApi.readFile).toHaveBeenCalledTimes(2))

    drawioMessage(oldIframe, { event: 'save', xml: '<mxfile>stale</mxfile>' })
    expect(fsApi.updateBuffer).not.toHaveBeenCalled()

    drawioMessage(currentIframe, { event: 'save', xml: '<mxfile>current</mxfile>' })
    await waitFor(() =>
      expect(fsApi.updateBuffer).toHaveBeenCalledWith(
        'diagrams/flow.drawio',
        '<mxfile>current</mxfile>',
        { path: 'diagrams/flow.drawio', revision: 0, dirty: false, session_generation: 1 },
      ),
    )
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).toContainEqual(['drawio-document', 'external', 'D:/two', 'diagrams/flow.drawio'])
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey),
    ).not.toContainEqual(['drawio-document', 'external', 'C:/one', 'diagrams/flow.drawio'])
  })

  it('ignores iframe saves after its cached workspace becomes inactive', async () => {
    const view = renderSurface()
    const iframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement

    view.rerender(
      <QueryClientProvider client={view.client}>
        <ActiveWorkspaceProvider value="external:D:/two">
          <DrawioEditorSurface path="diagrams/flow.drawio" readonly={false} title="flow.drawio" />
        </ActiveWorkspaceProvider>
      </QueryClientProvider>,
    )
    drawioMessage(iframe, { event: 'save', xml: '<mxfile>stale</mxfile>' })

    expect(fsApi.updateBuffer).not.toHaveBeenCalled()
  })

  it('ignores a save failure that arrives after the workspace session changes', async () => {
    let rejectSave: ((error: Error) => void) | undefined
    vi.mocked(fsApi.updateBuffer).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSave = reject
      }),
    )
    const view = renderSurface()
    const iframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement

    await waitFor(() =>
      expect(view.client.getQueryCache().getAll()[0]?.state.status).toBe('success'),
    )
    drawioMessage(iframe, { event: 'save', xml: '<mxfile>pending</mxfile>' })
    await waitFor(() => expect(fsApi.updateBuffer).toHaveBeenCalledOnce())

    workspaceIdentity.rootPath = 'D:/two'
    view.rerender(
      <QueryClientProvider client={view.client}>
        <ActiveWorkspaceProvider value="external:D:/two">
          <DrawioEditorSurface path="diagrams/flow.drawio" readonly={false} title="flow.drawio" />
        </ActiveWorkspaceProvider>
      </QueryClientProvider>,
    )
    await act(async () => rejectSave?.(new Error('stale save failed')))

    expect(screen.queryByText('stale save failed')).not.toBeInTheDocument()
    expect(screen.queryByText(/Save failed|保存失败/)).not.toBeInTheDocument()
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
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save|保存/ })).toBeEnabled()
  })

  it('announces the document loading overlay once while keeping the iframe mounted', () => {
    vi.mocked(fsApi.readFile).mockReturnValue(new Promise<string>(() => undefined))

    renderSurface()

    const loadingStatus = screen.getByRole('status', {
      name: /Reading diagram file|正在读取图表文件/,
    })
    expect(loadingStatus).toHaveAttribute('aria-busy', 'true')
    expect(loadingStatus.querySelector('[data-document-loading]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(loadingStatus.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByTitle(/flow\.drawio/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save|保存/ })).toBeDisabled()
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

  it('opens diagrams from the shared empty state and reports system app failures', async () => {
    useDrawioSettingsStore.setState({
      drawioEditorMode: 'system',
      drawioEmbedUrl: DEFAULT_DRAWIO_EMBED_URL,
    })

    const { container } = renderSurface()

    const emptyState = screen.getByRole('note')
    expect(emptyState).toHaveAttribute('data-slot', 'empty')
    expect(container.querySelector('[data-slot="empty-icon"]')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Open in system|使用系统应用打开/ }))

    expect(fsApi.openPathInSystem).toHaveBeenCalledWith('diagrams/flow.drawio')

    vi.mocked(fsApi.openPathInSystem).mockRejectedValue(new Error('No associated diagram app'))
    fireEvent.click(screen.getByRole('button', { name: /Open in system|使用系统应用打开/ }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/failed|失败/i), {
        description: expect.stringContaining('No associated diagram app'),
      }),
    )
  })

  it('uses an alert when the remote drawio document fails to load', async () => {
    vi.mocked(fsApi.readFile).mockRejectedValue(new Error('diagram unreadable'))

    const { container } = renderSurface()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Failed|失败/)
    expect(alert).toHaveClass('bg-destructive/10')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })

  it('flushes workspace buffers when the iframe sends exported xml', async () => {
    const view = renderSurface()
    const iframe = (await screen.findByTitle(/flow\.drawio/)) as HTMLIFrameElement

    await waitFor(() =>
      expect(view.client.getQueryCache().getAll()[0]?.state.status).toBe('success'),
    )
    drawioMessage(iframe, {
      event: 'export',
      xml: '<mxfile>saved</mxfile>',
    })

    await waitFor(() => {
      expect(fsApi.updateBuffer).toHaveBeenCalledWith(
        'diagrams/flow.drawio',
        '<mxfile>saved</mxfile>',
        { path: 'diagrams/flow.drawio', revision: 0, dirty: false, session_generation: 1 },
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
