import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSyncMenuSection } from '@/features/workspace-sync/WorkspaceSyncMenuSection'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    getChannels: vi.fn(),
    getGitSummary: vi.fn(),
    listWebDavProfiles: vi.fn(),
    setChannel: vi.fn(),
    removeChannel: vi.fn(),
  },
}))

const renderSection = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button>workspace</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <WorkspaceSyncMenuSection
            rootKind="external"
            rootPath="C:/notes"
            onConfigureWebDav={vi.fn()}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </QueryClientProvider>,
  )
}

describe('WorkspaceSyncMenuSection', () => {
  it('shows Git discovery and WebDAV binding as independent channels', async () => {
    vi.mocked(workspaceSyncApi.getChannels).mockResolvedValue({
      git: { provider: 'git', remote: 'origin', branch: 'main', autoFetch: true },
      webdav: {
        provider: 'webdav',
        profileId: 'cloud',
        remoteRoot: '/notes',
        autoSync: false,
      },
    })
    vi.mocked(workspaceSyncApi.getGitSummary).mockResolvedValue({
      status: 'ready',
      branch: 'main',
      head: 'abc',
      upstream: 'origin/main',
      ahead: 1,
      behind: 2,
      detached: false,
      clean: false,
      changeCount: 3,
      conflictCount: 0,
      remotes: [{ name: 'origin', fetchUrl: null, pushUrl: null }],
    })
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([])

    renderSection()
    expect(await screen.findByText('main')).toBeInTheDocument()
    expect(screen.getByText('/notes')).toBeInTheDocument()
    expect(screen.getAllByText(/sync\.channel\./)).toHaveLength(2)
    expect(screen.getByRole('menuitem', { name: /sync\.binding\.configure/ })).toBeInTheDocument()
  })

  it('explains that sync is unavailable for a single file', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger asChild>
            <Button>workspace</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <WorkspaceSyncMenuSection
              rootKind="single"
              rootPath="C:/notes/readme.md"
              onConfigureWebDav={vi.fn()}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </QueryClientProvider>,
    )
    expect(screen.getByText('sync.singleFileUnavailable')).toBeInTheDocument()
  })

  it('distinguishes Git detection failures and lets the user retry', async () => {
    vi.mocked(workspaceSyncApi.getChannels).mockResolvedValue({ git: null, webdav: null })
    vi.mocked(workspaceSyncApi.getGitSummary)
      .mockResolvedValueOnce({
        status: 'error',
        code: 'git_detection_failed',
        message: 'git crashed',
      })
      .mockResolvedValueOnce({ status: 'not_repository' })
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([])

    renderSection()
    expect(await screen.findByText('sync.git.detectionFailed')).toBeInTheDocument()
    expect(screen.queryByText('sync.git.notRepository')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('menuitem', { name: 'sync.git.retry' }))
    expect(await screen.findByText('sync.git.notRepository')).toBeInTheDocument()
    expect(workspaceSyncApi.getGitSummary).toHaveBeenCalledTimes(2)
  })
})
