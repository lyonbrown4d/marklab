import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiCompletionStatusPopover } from '@/components/ai/AiCompletionStatusPopover'
import { aiApi } from '@/services/aiApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'

vi.mock('@/services/aiApi', () => ({ aiApi: { listProviders: vi.fn() } }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const renderPopover = (onOpenSettings = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    onOpenSettings,
    ...render(
      <QueryClientProvider client={client}>
        <AiCompletionStatusPopover onOpenSettings={onOpenSettings} />
      </QueryClientProvider>,
    ),
  }
}

describe('AiCompletionStatusPopover', () => {
  beforeEach(() => {
    vi.mocked(aiApi.listProviders).mockResolvedValue([
      {
        id: 'ollama-local',
        label: 'Ollama',
        kind: 'openai-compatible',
        model: 'qwen3:8b',
        locality: 'local',
        available: true,
        requiresApiKey: false,
        hasApiKey: false,
        apiKeySource: 'none',
        maskedApiKey: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    usePreferencesStore.setState({
      aiCompletionEnabled: false,
      aiCompletionProviderId: 'ollama-local',
      aiCompletionTriggerMode: 'balanced',
    })
  })

  it('exposes automatic AI completion without conflating it with document completion', async () => {
    const { onOpenSettings } = renderPopover()
    const trigger = await screen.findByRole('button', { name: 'statusBar.aiCompletion' })

    expect(trigger).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(trigger)
    expect(await screen.findByText('Ollama · qwen3:8b')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'statusBar.aiCompletionEnabled' }))
    expect(usePreferencesStore.getState().aiCompletionEnabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'statusBar.aiCompletionSettings' }))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})
