import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceSyncSettingsPage from '@/components/settings/WorkspaceSyncSettingsPage'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    listWebDavProfiles: vi.fn(),
    saveWebDavProfile: vi.fn(),
    deleteWebDavProfile: vi.fn(),
    testWebDavProfile: vi.fn(),
  },
}))

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceSyncSettingsPage />
    </QueryClientProvider>,
  )
}

describe('WorkspaceSyncSettingsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows configured WebDAV connections and can test one', async () => {
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([
      {
        id: 'cloud',
        label: 'Home cloud',
        endpoint: 'https://dav.example.com',
        basePath: '/notes',
        username: 'ada',
        allowInsecureLocal: false,
        sessionOnly: false,
        hasPassword: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ])
    vi.mocked(workspaceSyncApi.testWebDavProfile).mockResolvedValue({ ok: true })

    renderPage()
    expect(await screen.findByText('Home cloud')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'sync.settings.testConnection' }))
    expect(workspaceSyncApi.testWebDavProfile).toHaveBeenCalledWith('cloud')
    expect(await screen.findByText('sync.settings.testSucceeded')).toBeInTheDocument()
  })

  it('does not present Git as workspace sync configuration', async () => {
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([])

    renderPage()

    await screen.findByText('sync.settings.noConnections')
    expect(screen.queryByText('sync.settings.gitEnvironment')).not.toBeInTheDocument()
    expect(screen.queryByText('sync.settings.gitCredentialNote')).not.toBeInTheDocument()
  })

  it('shows an actionable error when profiles cannot load', async () => {
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockRejectedValue(new Error('offline'))
    renderPage()
    expect(await screen.findByText('sync.settings.loadFailed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'actions.retry' })).toBeInTheDocument()
  })

  it('keeps the profile dialog open when saving fails', async () => {
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([
      {
        id: 'cloud',
        label: 'Home cloud',
        endpoint: 'https://dav.example.com',
        basePath: '/',
        username: 'ada',
        allowInsecureLocal: false,
        sessionOnly: false,
        hasPassword: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ])
    vi.mocked(workspaceSyncApi.saveWebDavProfile).mockRejectedValue(new Error('denied'))
    renderPage()
    await screen.findByText('Home cloud')
    await userEvent.click(screen.getByRole('button', { name: 'sync.settings.editConnection' }))
    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))
    expect(await screen.findByText('sync.settings.saveFailed')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('resets profile form state when switching between profiles', async () => {
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue(
      ['Alpha', 'Beta'].map((label) => ({
        id: label.toLowerCase(),
        label,
        endpoint: `https://${label.toLowerCase()}.example.com`,
        basePath: '/',
        username: 'ada',
        allowInsecureLocal: false,
        sessionOnly: false,
        hasPassword: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      })),
    )
    renderPage()
    await screen.findByText('Alpha')
    const editButtons = screen.getAllByRole('button', { name: 'sync.settings.editConnection' })
    await userEvent.click(editButtons[0]!)
    const name = screen.getByLabelText('sync.settings.name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Changed')
    await userEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    await userEvent.click(editButtons[1]!)
    expect(screen.getByLabelText('sync.settings.name')).toHaveValue('Beta')
  })
})
