import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AiSettingsPage from '@/components/settings/AiSettingsPage'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const api = vi.hoisted(() => ({
  listProviders: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
  testProvider: vi.fn(),
}))

vi.mock('@/services/aiApi', () => ({ aiApi: api }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const provider = (overrides: Record<string, unknown> = {}) => ({
  id: 'compatible-main',
  label: 'Local compatible',
  kind: 'openai-compatible',
  model: 'local-model',
  baseUrl: 'http://127.0.0.1:9000/v1',
  locality: 'local',
  available: true,
  requiresApiKey: false,
  hasApiKey: false,
  apiKeySource: 'none',
  maskedApiKey: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
})

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

const externalSection = () => {
  const section = screen
    .getByRole('heading', { name: 'settings.aiExternalLocal' })
    .closest('section')
  if (!section) throw new Error('External local AI section was not rendered.')
  return within(section)
}

describe('AiSettingsPage provider safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
    api.listProviders.mockResolvedValue([])
    api.updateProvider.mockImplementation(async (value) => ({
      ...value,
      locality: value.kind === 'openai-compatible' ? 'local' : 'remote',
      available: Boolean(value.apiKey) || value.baseUrl?.includes('127.0.0.1'),
      requiresApiKey: !value.baseUrl?.includes('127.0.0.1'),
      hasApiKey: Boolean(value.apiKey),
      apiKeySource: value.apiKey ? 'stored' : 'none',
      maskedApiKey: value.apiKey ? '••••••••' : null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }))
    api.deleteProvider.mockResolvedValue(undefined)
    api.testProvider.mockResolvedValue(true)
  })

  it('edits an existing Ollama preset instead of creating a fixed-id replacement', async () => {
    api.listProviders.mockResolvedValue([
      provider({
        id: 'ollama-local',
        label: 'My Ollama',
        model: 'qwen3:8b',
        baseUrl: 'http://127.0.0.1:11434/v1',
      }),
    ])
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await externalSection().findByRole('button', { name: 'settings.aiConfigureOllama' }),
    )
    expect(screen.getByLabelText('settings.aiProviderName')).toHaveValue('My Ollama')
    expect(screen.getByLabelText('settings.aiModel')).toHaveValue('qwen3:8b')
    await user.click(screen.getByRole('button', { name: 'settings.save' }))

    expect(api.updateProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ollama-local', model: 'qwen3:8b' }),
    )
  })

  it('allows a keyless loopback provider as default but blocks a keyless remote provider', async () => {
    api.listProviders.mockResolvedValue([
      provider(),
      provider({
        id: 'remote-compatible',
        label: 'Remote compatible',
        baseUrl: 'https://ai.example.com/v1',
        locality: 'remote',
        available: false,
        requiresApiKey: true,
      }),
    ])
    const user = userEvent.setup()
    renderPage()

    const localDefault = await screen.findByRole('button', {
      name: 'settings.aiMakeDefault Local compatible',
    })
    expect(localDefault).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'settings.aiMakeDefault Remote compatible' }),
    ).toBeDisabled()
    await user.click(localDefault)
    expect(usePreferencesStore.getState().aiDefaultProviderId).toBe('compatible-main')
  })

  it('distinguishes local and remote compatible privacy', async () => {
    api.listProviders.mockResolvedValue([
      provider(),
      provider({
        id: 'remote-compatible',
        label: 'Remote compatible',
        baseUrl: 'https://ai.example.com/v1',
        locality: 'remote',
        available: false,
        requiresApiKey: true,
      }),
    ])
    renderPage()

    expect(await screen.findByText('settings.aiLoopbackPrivacy')).toBeInTheDocument()
    expect(screen.getByText('settings.aiCompatibleRemoteWarning')).toBeInTheDocument()
  })

  it('identifies credential sources and can explicitly clear a stored key', async () => {
    api.listProviders.mockResolvedValue([
      provider({
        id: 'stored',
        label: 'Stored',
        baseUrl: 'https://stored.example.com/v1',
        locality: 'remote',
        requiresApiKey: true,
        available: true,
        hasApiKey: true,
        apiKeySource: 'stored',
      }),
      provider({
        id: 'environment',
        label: 'Environment',
        available: true,
        hasApiKey: true,
        apiKeySource: 'environment',
      }),
    ])
    const user = userEvent.setup()
    usePreferencesStore.setState({
      aiDefaultProviderId: 'stored',
      aiCompletionProviderId: 'stored',
    })
    renderPage()

    expect(await screen.findByText('settings.aiCredentialStored')).toBeInTheDocument()
    expect(screen.getByText('settings.aiCredentialEnvironment')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'settings.aiClearCredential Environment' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'settings.aiClearCredential Stored' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Stored')
    expect(api.updateProvider).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'settings.cancel' }))
    expect(api.updateProvider).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'settings.aiClearCredential Stored' }))
    await user.click(screen.getByRole('button', { name: 'settings.aiConfirmClearCredential' }))
    expect(api.updateProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stored', apiKey: null }),
    )
    await waitFor(() => expect(usePreferencesStore.getState().aiDefaultProviderId).toBeNull())
    expect(usePreferencesStore.getState().aiCompletionProviderId).toBeNull()
  })

  it('serializes provider deletes across rows and clears the deleted default in the hook', async () => {
    let resolveDelete!: () => void
    api.listProviders.mockResolvedValue([
      provider({ id: 'first', label: 'First' }),
      provider({ id: 'second', label: 'Second' }),
    ])
    api.deleteProvider.mockReturnValue(new Promise<void>((resolve) => (resolveDelete = resolve)))
    usePreferencesStore.setState({ aiDefaultProviderId: 'first' })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'settings.delete First' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('First')
    expect(api.deleteProvider).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'settings.aiConfirmDeleteProvider' }))
    expect(
      screen.getByRole('button', { name: 'settings.delete Second', hidden: true }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'settings.aiDeletingProvider' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    resolveDelete()
    await waitFor(() => expect(usePreferencesStore.getState().aiDefaultProviderId).toBeNull())
  })

  it('resets a stale save error when switching forms', async () => {
    api.updateProvider.mockRejectedValueOnce(new Error('stale save error'))
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await externalSection().findByRole('button', { name: 'settings.aiConfigureOllama' }),
    )
    await user.type(screen.getByLabelText('settings.aiModel'), 'qwen3:4b')
    await user.click(screen.getByRole('button', { name: 'settings.save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('stale save error')
    await user.click(screen.getByRole('button', { name: 'settings.cancel' }))
    await user.click(externalSection().getByRole('button', { name: 'settings.aiAddCompatible' }))
    expect(screen.queryByText('stale save error')).not.toBeInTheDocument()
  })
})
