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
  selectLocalModelDirectory: vi.fn(),
  setActiveLocalModel: vi.fn(),
  setLocalModelDirectory: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  testProvider: vi.fn(),
}))

vi.mock('@/services/aiApi', () => ({ aiApi: api }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const defaultStatus = {
  runtime: 'idle',
  activeModelId: null,
  models: [],
  modelDirectory: 'C:\\Users\\tester\\AppData\\Local\\MarkLab\\models',
  defaultModelDirectory: 'C:\\Users\\tester\\AppData\\Local\\MarkLab\\models',
  customModelDirectoryEnabled: false,
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

describe('AiSettingsPage local model directory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
    api.listProviders.mockResolvedValue([])
    api.localStatus.mockResolvedValue(defaultStatus)
    api.onLocalModelProgress.mockResolvedValue(() => undefined)
    api.onLocalModelDirectoryProgress.mockResolvedValue(() => undefined)
    api.selectLocalModelDirectory.mockResolvedValue({ path: null })
    api.setLocalModelDirectory.mockResolvedValue(defaultStatus)
  })

  it('shows the resolved default directory and explains background migration', async () => {
    renderPage()

    expect(await screen.findAllByText(defaultStatus.defaultModelDirectory)).toHaveLength(2)
    expect(screen.getByText('settings.aiModelDirectoryMigrationDescription')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'settings.aiCustomModelDirectory' }),
    ).not.toBeChecked()
    expect(
      screen.queryByRole('button', { name: 'settings.aiChooseModelDirectory' }),
    ).not.toBeInTheDocument()
  })

  it('selects a folder before enabling and syncs preferences only after backend success', async () => {
    const customPath = 'D:\\MarkLab Models'
    api.selectLocalModelDirectory.mockResolvedValue({ path: customPath })
    api.setLocalModelDirectory.mockResolvedValue({
      ...defaultStatus,
      modelDirectory: customPath,
      customModelDirectoryEnabled: true,
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('switch', { name: 'settings.aiCustomModelDirectory' }))

    expect(api.selectLocalModelDirectory).toHaveBeenCalledOnce()
    expect(api.setLocalModelDirectory).toHaveBeenCalledWith({ enabled: true, path: customPath })
    await waitFor(() => {
      expect(usePreferencesStore.getState()).toMatchObject({
        aiCustomModelDirectoryEnabled: true,
        aiModelDirectory: customPath,
      })
    })
    expect(screen.getByText(customPath)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.aiChooseModelDirectory' })).toBeEnabled()
  })

  it('keeps the default disabled when folder selection is cancelled', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('switch', { name: 'settings.aiCustomModelDirectory' }))

    expect(api.setLocalModelDirectory).not.toHaveBeenCalled()
    expect(usePreferencesStore.getState().aiCustomModelDirectoryEnabled).toBe(false)
  })

  it('restores the default only after backend success and surfaces a busy-runtime rejection', async () => {
    const customPath = 'D:\\MarkLab Models'
    api.localStatus.mockResolvedValue({
      ...defaultStatus,
      modelDirectory: customPath,
      customModelDirectoryEnabled: true,
    })
    api.setLocalModelDirectory.mockRejectedValue(new Error('Stop active model operations first'))
    usePreferencesStore.setState({
      aiCustomModelDirectoryEnabled: true,
      aiModelDirectory: customPath,
    })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('switch', { name: 'settings.aiCustomModelDirectory' }))

    expect(api.setLocalModelDirectory).toHaveBeenCalledWith({ enabled: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Stop active model operations first')
    expect(usePreferencesStore.getState().aiCustomModelDirectoryEnabled).toBe(true)
  })

  it('renders migration progress and disables conflicting model actions', async () => {
    let migrationHandler!: (event: Record<string, unknown>) => void
    api.localStatus.mockResolvedValue({
      ...defaultStatus,
      models: [
        {
          id: 'download-model',
          label: 'Download model',
          sizeBytes: 100,
          license: 'Apache-2.0',
          installed: false,
          active: false,
          recommended: true,
        },
        {
          id: 'installed-model',
          label: 'Installed model',
          sizeBytes: 100,
          license: 'Apache-2.0',
          installed: true,
          active: false,
          recommended: false,
        },
      ],
    })
    api.onLocalModelDirectoryProgress.mockImplementation((handler: typeof migrationHandler) => {
      migrationHandler = handler
      return Promise.resolve(() => undefined)
    })
    renderPage()
    await screen.findByText('Download model')

    migrationHandler({
      migrationId: 'migration-1',
      state: 'copying',
      from: defaultStatus.defaultModelDirectory,
      to: 'D:\\MarkLab Models',
      copiedBytes: 35,
      totalBytes: 100,
      percent: 35,
    })

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '35')
    expect(screen.getByText('settings.aiModelDirectoryMigration.copying')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'settings.aiCustomModelDirectory' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'settings.aiDownload Download model' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'settings.aiDeleteModel Installed model' }),
    ).toBeDisabled()
  })

  it('cleans up a directory progress subscription that resolves after unmount', async () => {
    let resolveSubscription!: (unsubscribe: () => void) => void
    const unsubscribe = vi.fn()
    api.onLocalModelDirectoryProgress.mockReturnValue(
      new Promise((resolve) => (resolveSubscription = resolve)),
    )
    const view = renderPage()

    view.unmount()
    resolveSubscription(unsubscribe)

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce())
  })

  it('refreshes authoritative status and syncs preferences after migration completes', async () => {
    let migrationHandler!: (event: Record<string, unknown>) => void
    const customPath = 'D:\\MarkLab Models'
    api.localStatus.mockResolvedValueOnce(defaultStatus).mockResolvedValueOnce({
      ...defaultStatus,
      modelDirectory: customPath,
      customModelDirectoryEnabled: true,
    })
    api.onLocalModelDirectoryProgress.mockImplementation((handler: typeof migrationHandler) => {
      migrationHandler = handler
      return Promise.resolve(() => undefined)
    })
    renderPage()
    await screen.findByRole('switch', { name: 'settings.aiCustomModelDirectory' })

    migrationHandler({
      migrationId: 'migration-1',
      state: 'completed',
      from: defaultStatus.defaultModelDirectory,
      to: customPath,
      copiedBytes: 100,
      totalBytes: 100,
      percent: 100,
      warning: 'Old directory cleanup is still required.',
    })

    await waitFor(() => {
      expect(usePreferencesStore.getState()).toMatchObject({
        aiCustomModelDirectoryEnabled: true,
        aiModelDirectory: customPath,
      })
    })
    expect(screen.getByText('Old directory cleanup is still required.')).toBeInTheDocument()
  })

  it('does not let a completed migration refresh overwrite a newer migration', async () => {
    let migrationHandler!: (event: Record<string, unknown>) => void
    let resolveCompletedStatus!: (status: typeof defaultStatus) => void
    const completedStatus = new Promise<typeof defaultStatus>(
      (resolve) => (resolveCompletedStatus = resolve),
    )
    api.localStatus.mockResolvedValueOnce(defaultStatus).mockReturnValueOnce(completedStatus)
    api.onLocalModelDirectoryProgress.mockImplementation((handler: typeof migrationHandler) => {
      migrationHandler = handler
      return Promise.resolve(() => undefined)
    })
    renderPage()
    await screen.findByRole('switch', { name: 'settings.aiCustomModelDirectory' })

    migrationHandler({
      migrationId: 'migration-a',
      state: 'completed',
      from: defaultStatus.defaultModelDirectory,
      to: 'D:\\Migration A',
      copiedBytes: 100,
      totalBytes: 100,
      percent: 100,
    })
    await waitFor(() => expect(api.localStatus).toHaveBeenCalledTimes(2))
    migrationHandler({
      migrationId: 'migration-b',
      state: 'copying',
      from: defaultStatus.defaultModelDirectory,
      to: 'E:\\Migration B',
      copiedBytes: 25,
      totalBytes: 100,
      percent: 25,
    })
    resolveCompletedStatus({
      ...defaultStatus,
      modelDirectory: 'D:\\Migration A',
      customModelDirectoryEnabled: true,
    })

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    })
    expect(usePreferencesStore.getState()).toMatchObject({
      aiCustomModelDirectoryEnabled: false,
      aiModelDirectory: null,
    })
  })

  it('surfaces directory status errors even while the runtime is idle', async () => {
    api.localStatus.mockResolvedValue({
      ...defaultStatus,
      error: 'The configured model volume is unavailable.',
    })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The configured model volume is unavailable.',
    )
  })

  it('keeps the old directory and offers retry after migration failure', async () => {
    api.localStatus.mockResolvedValue({
      ...defaultStatus,
      migration: {
        migrationId: 'migration-1',
        state: 'error',
        from: defaultStatus.defaultModelDirectory,
        to: 'D:\\MarkLab Models',
        copiedBytes: 40,
        totalBytes: 100,
        percent: 40,
        error: 'The target volume was disconnected.',
      },
    })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The target volume was disconnected.',
    )
    expect(
      screen.getByRole('button', { name: 'settings.aiRetryModelDirectoryMigration' }),
    ).toBeEnabled()
    expect(screen.getAllByText(defaultStatus.defaultModelDirectory)).toHaveLength(2)
  })
})
