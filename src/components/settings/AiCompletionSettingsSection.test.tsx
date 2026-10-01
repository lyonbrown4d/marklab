import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
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

const localProvider = {
  id: 'ollama-local',
  label: 'Ollama',
  kind: 'openai-compatible',
  model: 'qwen3:4b',
  baseUrl: 'http://127.0.0.1:11434/v1',
  hasApiKey: false,
  apiKeySource: 'none',
  maskedApiKey: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const cloudProvider = {
  ...localProvider,
  id: 'openai-main',
  label: 'OpenAI',
  kind: 'openai',
  model: 'gpt-5-mini',
  baseUrl: undefined,
  hasApiKey: true,
  apiKeySource: 'stored',
  maskedApiKey: '••••••••',
}

const unavailableCloudProvider = {
  ...cloudProvider,
  id: 'openai-no-credential',
  label: 'OpenAI without credential',
  hasApiKey: false,
  apiKeySource: 'none',
  maskedApiKey: null,
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

const renderPage = () => render(<AiSettingsPage />, { wrapper })

const selectOption = async (label: string, option: string) => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('AI completion settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
    api.listProviders.mockResolvedValue([localProvider, cloudProvider])
    api.localStatus.mockResolvedValue({ runtime: 'unavailable', activeModelId: null, models: [] })
    api.onLocalModelProgress.mockResolvedValue(() => undefined)
    api.onLocalModelDirectoryProgress.mockResolvedValue(() => undefined)
  })

  it('toggles completion and updates provider, trigger, length, and nearby context preferences', async () => {
    const user = userEvent.setup()
    renderPage()

    const section = await screen.findByRole('heading', { name: 'settings.aiCompletion' })
    const controls = within(section.closest('section')!)
    const documentCompletion = controls.getByRole('switch', {
      name: 'settings.documentCompletionEnabled',
    })
    expect(documentCompletion).toBeChecked()
    await user.click(documentCompletion)
    await user.click(controls.getByRole('switch', { name: 'settings.aiCompletionEnabled' }))
    await selectOption('settings.aiCompletionProvider', 'Ollama')
    await selectOption('settings.aiCompletionTriggerMode', 'settings.aiCompletionTrigger.fast')
    await selectOption('settings.aiCompletionLength', 'settings.aiCompletionLength.long')
    await user.click(
      controls.getByRole('switch', { name: 'settings.aiCompletionNearbyContextEnabled' }),
    )

    expect(usePreferencesStore.getState()).toMatchObject({
      documentCompletionEnabled: false,
      aiCompletionEnabled: true,
      aiCompletionProviderId: 'ollama-local',
      aiCompletionTriggerMode: 'fast',
      aiCompletionLength: 'long',
      aiCompletionNearbyContextEnabled: false,
    })
  })

  it('requires an explicit consent toggle for cloud context but not local providers', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'settings.aiCompletion' })
    await user.click(screen.getByRole('switch', { name: 'settings.aiCompletionEnabled' }))

    await selectOption('settings.aiCompletionProvider', 'Ollama')
    expect(screen.getByText('settings.aiCompletionLocalPrivacy')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'settings.aiCompletionCloudContextConsent' }),
    ).toBeDisabled()

    await selectOption('settings.aiCompletionProvider', 'OpenAI')
    expect(await screen.findByText('settings.aiCompletionCloudPrivacy')).toBeInTheDocument()
    const consent = screen.getByRole('switch', {
      name: 'settings.aiCompletionCloudContextConsent',
    })
    expect(consent).toBeEnabled()
    await user.click(consent)
    expect(usePreferencesStore.getState().aiCompletionCloudContextConsent).toBe(true)
  })

  it('follows a remote default provider and enables explicit cloud context consent', async () => {
    usePreferencesStore.setState({
      aiCompletionEnabled: true,
      aiCompletionProviderId: null,
      aiDefaultProviderId: cloudProvider.id,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'settings.aiCompletion' })
    expect(
      screen.getByRole('combobox', { name: 'settings.aiCompletionProvider' }),
    ).toHaveTextContent('settings.aiCompletionFollowDefault')
    expect(usePreferencesStore.getState().aiCompletionProviderId).toBeNull()
    expect(await screen.findByText('settings.aiCompletionCloudPrivacy')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'settings.aiCompletionCloudContextConsent' }),
    ).toBeEnabled()
  })

  it('follows a local Ollama default without requesting cloud context consent', async () => {
    usePreferencesStore.setState({
      aiCompletionEnabled: true,
      aiCompletionProviderId: null,
      aiDefaultProviderId: localProvider.id,
    })
    renderPage()

    await screen.findByRole('heading', { name: 'settings.aiCompletion' })
    expect(
      screen.getByRole('combobox', { name: 'settings.aiCompletionProvider' }),
    ).toHaveTextContent('settings.aiCompletionFollowDefault')
    expect(await screen.findByText('settings.aiCompletionLocalPrivacy')).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'settings.aiCompletionCloudContextConsent' }),
    ).toBeDisabled()
  })

  it('omits remote providers without credentials from the completion provider choices', async () => {
    api.listProviders.mockResolvedValue([localProvider, cloudProvider, unavailableCloudProvider])
    usePreferencesStore.setState({ aiCompletionEnabled: true })
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('button', {
      name: 'settings.aiMakeDefault OpenAI without credential',
    })
    await user.click(screen.getByRole('combobox', { name: 'settings.aiCompletionProvider' }))

    expect(screen.getByRole('option', { name: 'Ollama' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'OpenAI without credential' }),
    ).not.toBeInTheDocument()
  })

  it('shows neutral privacy guidance when no effective AI provider is configured', async () => {
    api.listProviders.mockResolvedValue([])
    usePreferencesStore.setState({
      aiCompletionEnabled: true,
      aiCompletionProviderId: null,
      aiDefaultProviderId: null,
    })
    renderPage()

    expect(await screen.findByText('settings.aiCompletionNoProviderPrivacy')).toBeInTheDocument()
    expect(screen.queryByText('settings.aiCompletionLocalPrivacy')).not.toBeInTheDocument()
    expect(screen.queryByText('settings.aiCompletionCloudPrivacy')).not.toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'settings.aiCompletionCloudContextConsent' }),
    ).toBeDisabled()
  })
})
