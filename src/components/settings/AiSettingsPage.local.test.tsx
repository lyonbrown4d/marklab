import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiSettingsPage from '@/components/settings/AiSettingsPage'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const api = vi.hoisted(() => ({
  cancelLocalModelDownload: vi.fn(),
  deleteLocalModel: vi.fn(),
  downloadLocalModel: vi.fn(),
  listProviders: vi.fn(),
  localStatus: vi.fn(),
  onLocalModelProgress: vi.fn(),
  onLocalModelDirectoryProgress: vi.fn(),
  setActiveLocalModel: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  testProvider: vi.fn(),
}))

vi.mock('@/services/aiApi', () => ({ aiApi: api }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const model = {
  id: 'qwen3-0.6b-q4',
  label: 'Qwen3 0.6B · Lightweight',
  description: 'Quick, basic local rewriting.',
  sizeBytes: 428_970_080,
  license: 'Apache-2.0',
  installed: false,
  active: false,
  recommended: true,
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
    }
  >
    {children}
  </QueryClientProvider>
)

const renderPage = () => render(<AiSettingsPage />, { wrapper })

describe('AiSettingsPage local AI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
    api.listProviders.mockResolvedValue([])
    api.localStatus.mockResolvedValue({ runtime: 'idle', activeModelId: null, models: [model] })
    api.onLocalModelProgress.mockResolvedValue(() => undefined)
    api.onLocalModelDirectoryProgress.mockResolvedValue(() => undefined)
    api.downloadLocalModel.mockResolvedValue({ taskId: 'task-1' })
    api.cancelLocalModelDownload.mockResolvedValue({ ok: true })
    api.deleteLocalModel.mockResolvedValue({ ok: true })
    api.setActiveLocalModel.mockResolvedValue({ ok: true })
  })

  it('shows explicit loading, success metadata, and privacy states without auto-downloading', async () => {
    let resolveStatus!: (value: unknown) => void
    api.localStatus.mockReturnValue(new Promise((resolve) => (resolveStatus = resolve)))
    renderPage()

    expect(screen.getByText('settings.aiLoading')).toHaveAttribute('role', 'status')
    resolveStatus({ runtime: 'idle', activeModelId: null, models: [model] })

    expect(await screen.findByText('Qwen3 0.6B · Lightweight')).toBeInTheDocument()
    expect(screen.getByText('settings.aiQwenCompactDescription')).toBeInTheDocument()
    expect(screen.getByText(/429 MB/)).toBeInTheDocument()
    expect(screen.getByText(/Apache-2.0/)).toBeInTheDocument()
    expect(screen.getByText('settings.aiBuiltInPrivacy')).toBeInTheDocument()
    expect(screen.getByText('settings.aiRuntime.idle')).toBeInTheDocument()
    expect(screen.getByText('settings.aiNotInstalled')).toBeInTheDocument()
    expect(api.downloadLocalModel).not.toHaveBeenCalled()
  })

  it('offers an actionable retry when local status fails', async () => {
    api.localStatus.mockRejectedValue(new Error('runtime unavailable'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('runtime unavailable')
    expect(screen.getByRole('button', { name: 'settings.aiRetryLocal' })).toBeEnabled()
  })

  it('disables model actions when the catalog is unavailable', async () => {
    api.localStatus.mockResolvedValue({ runtime: 'unavailable', activeModelId: null, models: [] })
    renderPage()

    expect(await screen.findByText('settings.aiCatalogUnavailable')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'settings.aiDownload' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.aiRetryLocal' })).toBeEnabled()
  })

  it('surfaces a runtime error returned with a successful status response', async () => {
    api.localStatus.mockResolvedValue({
      runtime: 'error',
      activeModelId: null,
      models: [model],
      error: 'Model runtime failed to start',
    })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Model runtime failed to start')
  })

  it('guards duplicate downloads and supports progress cancellation', async () => {
    let resolveDownload!: (value: { taskId: string }) => void
    let progressHandler!: (event: Record<string, unknown>) => void
    api.downloadLocalModel.mockReturnValue(new Promise((resolve) => (resolveDownload = resolve)))
    api.onLocalModelProgress.mockImplementation((handler: typeof progressHandler) => {
      progressHandler = handler
      return Promise.resolve(() => undefined)
    })
    const user = userEvent.setup()
    renderPage()

    const download = await screen.findByRole('button', {
      name: `settings.aiDownload ${model.label}`,
    })
    await user.dblClick(download)
    expect(api.downloadLocalModel).toHaveBeenCalledTimes(1)
    expect(download).toBeDisabled()

    resolveDownload({ taskId: 'task-1' })
    await waitFor(() => expect(api.downloadLocalModel).toHaveBeenCalledWith(model.id))
    progressHandler({
      taskId: 'task-1',
      modelId: model.id,
      state: 'downloading',
      downloadedBytes: 214_485_040,
      totalBytes: 428_970_080,
      percent: 50,
    })

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    await user.click(
      screen.getByRole('button', { name: `settings.aiCancelDownload ${model.label}` }),
    )
    expect(api.cancelLocalModelDownload).toHaveBeenCalledWith('task-1')
  })

  it('keeps newer progress when it arrives before the download response', async () => {
    let resolveDownload!: (value: { taskId: string }) => void
    let progressHandler!: (event: Record<string, unknown>) => void
    api.downloadLocalModel.mockReturnValue(new Promise((resolve) => (resolveDownload = resolve)))
    api.onLocalModelProgress.mockImplementation((handler: typeof progressHandler) => {
      progressHandler = handler
      return Promise.resolve(() => undefined)
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: `settings.aiDownload ${model.label}` }),
    )
    progressHandler({
      taskId: 'task-1',
      modelId: model.id,
      state: 'downloading',
      downloadedBytes: 214_485_040,
      totalBytes: 428_970_080,
      percent: 50,
    })
    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    resolveDownload({ taskId: 'task-1' })

    await waitFor(() =>
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50'),
    )
  })

  it('reports a local model action failure without starting a download', async () => {
    api.downloadLocalModel.mockRejectedValue(new Error('Download could not start'))
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: `settings.aiDownload ${model.label}` }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Download could not start')
  })

  it('sets and persists the built-in model as the default', async () => {
    api.localStatus.mockResolvedValue({
      runtime: 'ready',
      activeModelId: model.id,
      models: [{ ...model, installed: true, active: true }],
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: `settings.aiMakeDefault ${model.label}` }),
    )
    expect(usePreferencesStore.getState().aiDefaultProviderId).toBe('marklab-local')
    expect(screen.getByText('settings.aiDefaultActive')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: `settings.aiDeleteModel ${model.label}` }),
    ).toBeEnabled()
  })

  it('clears the built-in default only after its model is deleted', async () => {
    usePreferencesStore.setState({ aiDefaultProviderId: 'marklab-local' })
    api.localStatus.mockResolvedValue({
      runtime: 'idle',
      activeModelId: null,
      models: [{ ...model, installed: true }],
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: `settings.aiDeleteModel ${model.label}` }),
    )

    await waitFor(() => expect(api.deleteLocalModel).toHaveBeenCalledWith(model.id))
    expect(usePreferencesStore.getState().aiDefaultProviderId).toBeNull()
  })

  it('cleans up a progress subscription that resolves after unmount', async () => {
    let resolveSubscription!: (unsubscribe: () => void) => void
    const unsubscribe = vi.fn()
    api.onLocalModelProgress.mockReturnValue(
      new Promise((resolve) => (resolveSubscription = resolve)),
    )
    const view = renderPage()

    view.unmount()
    resolveSubscription(unsubscribe)

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce())
  })
})
