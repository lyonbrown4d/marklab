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

const cloudProvider = {
  id: 'openai-main',
  label: 'OpenAI',
  kind: 'openai',
  model: 'gpt-5-mini',
  locality: 'remote',
  available: true,
  requiresApiKey: true,
  hasApiKey: true,
  apiKeySource: 'stored',
  maskedApiKey: '••••••••',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
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

const externalSection = () => {
  const section = screen
    .getByRole('heading', { name: 'settings.aiExternalLocal' })
    .closest('section')
  if (!section) throw new Error('External local AI section was not rendered.')
  return within(section)
}

describe('AiSettingsPage provider management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
    api.listProviders.mockResolvedValue([])
    api.updateProvider.mockImplementation(async (value) => ({
      ...value,
      locality: value.kind === 'openai-compatible' ? 'local' : 'remote',
      available: value.kind === 'openai-compatible' || Boolean(value.apiKey),
      requiresApiKey: value.kind !== 'openai-compatible',
      hasApiKey: Boolean(value.apiKey),
      apiKeySource: value.apiKey ? 'stored' : 'none',
      maskedApiKey: value.apiKey ? '••••••••' : null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }))
    api.deleteProvider.mockResolvedValue(undefined)
    api.testProvider.mockResolvedValue(true)
  })

  it('shows provider loading, error, and empty states', async () => {
    let rejectProviders!: (reason: Error) => void
    api.listProviders.mockReturnValue(new Promise((_, reject) => (rejectProviders = reject)))
    renderPage()

    expect(screen.getByText('settings.aiProvidersLoading')).toBeInTheDocument()
    rejectProviders(new Error('provider storage failed'))

    expect(await screen.findByText('provider storage failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.aiRetryProviders' })).toBeEnabled()
  })

  it('saves the Ollama preset without an API key and guards duplicate submit', async () => {
    let resolveSave!: (value: typeof cloudProvider) => void
    api.updateProvider.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)))
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'settings.aiExternalLocal' })
    await user.click(externalSection().getByRole('button', { name: 'settings.aiConfigureOllama' }))
    expect(screen.getByLabelText('settings.aiBaseUrl')).toHaveValue('http://127.0.0.1:11434/v1')
    expect(screen.queryByLabelText('settings.aiApiKey')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('settings.aiModel'), 'qwen3:4b')
    const save = screen.getByRole('button', { name: 'settings.save' })
    await user.dblClick(save)

    expect(api.updateProvider).toHaveBeenCalledTimes(1)
    expect(api.updateProvider.mock.calls[0]?.[0].id).not.toBe('ollama-local')
    expect(api.updateProvider).toHaveBeenCalledWith({
      id: expect.stringMatching(/^ollama-/),
      label: 'Ollama',
      kind: 'openai-compatible',
      model: 'qwen3:4b',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: null,
    })
    expect(save).toBeDisabled()
    resolveSave(cloudProvider)
  })

  it('offers a configurable OpenAI-compatible local service with an optional secret', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { name: 'settings.aiExternalLocal' })
    await user.click(externalSection().getByRole('button', { name: 'settings.aiAddCompatible' }))

    const providerDialog = screen.getByRole('dialog', { name: 'settings.aiAddCompatible' })
    expect(within(providerDialog).getByLabelText('settings.aiBaseUrl')).toHaveValue('')
    expect(within(providerDialog).getByLabelText('settings.aiApiKey')).toHaveAttribute(
      'type',
      'password',
    )

    await user.click(within(providerDialog).getByRole('button', { name: 'settings.cancel' }))
    expect(
      screen.queryByRole('dialog', { name: 'settings.aiAddCompatible' }),
    ).not.toBeInTheDocument()
  })

  it('never reveals a stored key and preserves it when an edited key stays blank', async () => {
    api.listProviders.mockResolvedValue([cloudProvider])
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'settings.edit OpenAI' }))
    const providerDialog = screen.getByRole('dialog', { name: 'settings.aiEditProvider' })
    const keyInput = within(providerDialog).getByLabelText('settings.aiApiKey')
    expect(keyInput).toHaveAttribute('type', 'password')
    expect(keyInput).toHaveValue('')
    expect(screen.queryByDisplayValue('••••••••')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'settings.save' }))

    expect(api.updateProvider).toHaveBeenCalledWith({
      id: cloudProvider.id,
      label: cloudProvider.label,
      kind: cloudProvider.kind,
      model: cloudProvider.model,
    })
    expect(await screen.findByRole('button', { name: 'settings.edit OpenAI' })).toBeEnabled()
  })

  it('tests, defaults, and deletes a configured provider', async () => {
    api.listProviders.mockResolvedValueOnce([cloudProvider]).mockResolvedValue([])
    usePreferencesStore.setState({ aiCompletionProviderId: cloudProvider.id })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'settings.aiTest OpenAI' }))
    expect(await screen.findByText('settings.aiTestSucceeded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'settings.aiMakeDefault OpenAI' }))
    expect(usePreferencesStore.getState().aiDefaultProviderId).toBe(cloudProvider.id)
    await user.click(screen.getByRole('button', { name: 'settings.delete OpenAI' }))
    await user.click(screen.getByRole('button', { name: 'settings.aiConfirmDeleteProvider' }))

    await waitFor(() => expect(api.deleteProvider).toHaveBeenCalledWith(cloudProvider.id))
    expect(usePreferencesStore.getState().aiDefaultProviderId).toBeNull()
    expect(usePreferencesStore.getState().aiCompletionProviderId).toBeNull()
    expect(screen.getByRole('button', { name: 'settings.aiAddCloudProvider' })).toHaveFocus()
  })

  it('keeps the default and reports an error when deletion fails', async () => {
    api.listProviders.mockResolvedValue([cloudProvider])
    api.deleteProvider
      .mockRejectedValueOnce(new Error('Could not delete provider'))
      .mockResolvedValueOnce(undefined)
    usePreferencesStore.setState({ aiDefaultProviderId: cloudProvider.id })
    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: 'settings.delete OpenAI' }))
    await user.click(screen.getByRole('button', { name: 'settings.aiConfirmDeleteProvider' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete provider')
    expect(usePreferencesStore.getState().aiDefaultProviderId).toBe(cloudProvider.id)
    expect(screen.getByRole('button', { name: 'settings.aiConfirmDeleteProvider' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'settings.cancel' }))
    await user.click(screen.getByRole('button', { name: 'settings.delete OpenAI' }))
    expect(screen.queryByText('Could not delete provider')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'settings.aiConfirmDeleteProvider' }))
    await waitFor(() => expect(api.deleteProvider).toHaveBeenCalledTimes(2))
  })
})
